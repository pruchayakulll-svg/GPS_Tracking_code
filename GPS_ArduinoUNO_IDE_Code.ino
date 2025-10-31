#include <TinyGPS++.h>
#include <SoftwareSerial.h>

static const int RXPin = 4, TXPin = 3;     // กำหนดขา RX, TX ของ SoftwareSerial
static const uint32_t GPSBaud = 9600;     

TinyGPSPlus gps;
SoftwareSerial ss(RXPin, TXPin);

double lastLat = 0.0;
double lastLon = 0.0;
const double movementThreshold = 5.0;      

unsigned long stopStartTime = 0;
bool stopFlag = false;

void setup() {
  Serial.begin(9600);
  ss.begin(GPSBaud);
  Serial.println(F("TinyGPS++ JSON every 5s if moved > 5m or stopped > 15 sec"));
}

void loop() {
  // อ่านข้อมูล GPS จาก SoftwareSerial
  while (ss.available()) {
    gps.encode(ss.read());
  }

  static unsigned long lastStatus = 0;
  if (millis() - lastStatus >= 1000) {
    lastStatus = millis();

    // แสดงสถานะบน Serial Monitor ทุก 1 วินาที
    Serial.print(F("Sats: "));   Serial.print(gps.satellites.value());
    Serial.print(F(" | HDOP: ")); Serial.print(gps.hdop.hdop(), 2);
    Serial.print(F(" | Lat: "));  Serial.print(gps.location.lat(), 6);
    Serial.print(F(" | Lon: "));  Serial.print(gps.location.lng(), 6);
    Serial.print(F(" | Speed: "));Serial.print(gps.speed.kmph(), 2);
    Serial.println(F(" km/h"));
  }

  // ถ้าข้อมูล GPS ครบถ้วน
  if (gps.location.isValid() && gps.date.isValid() && gps.time.isValid()) {

    double currentLat = gps.location.lat();
    double currentLon = gps.location.lng();
    double speedKmh = gps.speed.kmph();

    bool sendData = false;
    bool isGarbagePoint = false;
  
  // ตรวจจับหยุดนิ่ง
  if (speedKmh <= 1.0) {
    if (stopStartTime == 0) {
    stopStartTime = millis();   // เริ่มจับเวลา
  } 
  else if (millis() - stopStartTime >= 15000) {
    // หยุดนิ่งเกิน 15 วิ -> บันทึกจุดเก็บขยะ
    isGarbagePoint = true;
    sendData = true;
    stopStartTime = millis();   // รีเซ็ตเวลาใหม่เพื่อให้ส่งซ้ำทุก 15 วิ
  }
} 
else {
  // ถ้าเคลื่อนที่ รีเซ็ตตัวจับเวลา
  stopStartTime = 0;
}

    // ตรวจจับการเคลื่อนที่ > movementThreshold และ speed > 1 km/h
    double distanceMoved = TinyGPSPlus::distanceBetween(currentLat, currentLon, lastLat, lastLon);
    if (speedKmh > 1.0 && distanceMoved >= movementThreshold) {
      lastLat = currentLat;
      lastLon = currentLon;
      sendData = true;
      isGarbagePoint = false;   // กรณีเคลื่อนที่ ไม่ใช่จุดหยุดขยะ
    }

    // ถ้าต้องส่งข้อมูล
    if (sendData) {
      const char* dir = gps.course.isValid() ? TinyGPSPlus::cardinal(gps.course.deg()) : "---";

      String payload;
      payload.reserve(220);

      payload += F("{ \"sat\": ");
      payload += gps.satellites.value();

      payload += F(", \"hdop\": ");
      payload += String(gps.hdop.hdop(), 2);

      payload += F(", \"lat\": ");
      payload += String(currentLat, 6);

      payload += F(", \"lon\": ");
      payload += String(currentLon, 6);

      payload += F(", \"date\": \"");
      if (gps.date.day() < 10) payload += '0';
      payload += String(gps.date.day());
      payload += '/';
      if (gps.date.month() < 10) payload += '0';
      payload += String(gps.date.month());
      payload += '/';
      payload += String(gps.date.year());
      payload += '\"';

      payload += F(", \"time\": \"");
      payload += twoDigits(gps.time.hour());   payload += ':';
      payload += twoDigits(gps.time.minute()); payload += ':';
      payload += twoDigits(gps.time.second()); payload += '\"';

      payload += F(", \"course\": ");
      payload += String(gps.course.deg(), 2);

      payload += F(", \"speed\": ");
      payload += String(speedKmh, 2);

      payload += F(", \"dir\": \"");
      payload += dir;
      payload += F("\"");

      // ส่ง status ว่าเป็นจุดเก็บขยะหรือปกติ
      payload += F(", \"status\": \"");
      payload += isGarbagePoint ? "จุดเก็บขยะ" : "ปกติ";
      payload += F("\"");

      payload += F(" }");

      Serial.println(payload);
    }
  }
}

/* ----- helper: แปลงเลขให้ออกมาเป็น 2 หลักเสมอ ----- */
String twoDigits(uint8_t x) {
  if (x < 10) return '0' + String(x);
  return String(x);
}
