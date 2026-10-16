// Where the phone is and which way it faces. Position comes from the Geolocation API. Heading
// comes from the compass when the phone gives one (iOS needs permission from a tap first), and
// otherwise from the direction of travel while moving.
export class Sensors {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.pos = null;          // { lat, lng, accuracy, speed, at }
    this.heading = null;      // degrees from north
    this.headingSource = null; // 'compass' | 'gps'
    this.error = null;
    this.watchId = null;
    this.listening = false;
    this.lastHeadingEmit = 0;
  }

  start() {
    if (!('geolocation' in navigator)) { this.error = 'This phone has no location service'; this.onUpdate('error'); return; }
    if (this.watchId != null) return;
    this.watchId = navigator.geolocation.watchPosition((p) => {
      const c = p.coords;
      this.pos = { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy, speed: c.speed, at: p.timestamp || Date.now() };
      this.error = null;
      if (this.headingSource !== 'compass' && c.heading != null && !Number.isNaN(c.heading) && (c.speed || 0) > 0.7) {
        this.heading = c.heading; this.headingSource = 'gps';
      }
      this.onUpdate('pos');
    }, (err) => {
      this.error = err.code === 1 ? 'Location is blocked for this app. Allow it in the phone settings.' : (err.message || 'No location');
      this.onUpdate('error');
    }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
    this.listenOrientation();
  }

  stop() {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }

  // iOS asks the user before it gives compass readings, and only from a tap.
  async requestCompass() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') throw new Error('Compass permission was not granted');
    }
    this.listenOrientation();
  }

  listenOrientation() {
    if (this.listening || typeof window === 'undefined') return;
    this.listening = true;
    const handler = (e) => {
      let h = null;
      if (e.webkitCompassHeading != null && !Number.isNaN(e.webkitCompassHeading)) h = e.webkitCompassHeading;
      else if ((e.absolute || e.type === 'deviceorientationabsolute') && e.alpha != null) h = (360 - e.alpha) % 360;
      if (h == null) return;
      this.heading = h; this.headingSource = 'compass';
      const now = Date.now();
      if (now - this.lastHeadingEmit > 250) { this.lastHeadingEmit = now; this.onUpdate('heading'); }
    };
    window.addEventListener('deviceorientationabsolute', handler, true);
    window.addEventListener('deviceorientation', handler, true);
  }
}
