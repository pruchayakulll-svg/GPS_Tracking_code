#include <Wire.h>
#include <U8g2lib.h>
#include <ESP8266WiFi.h>
#include <WiFiManager.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ===== OLED Config =====
#define OLED_SDA D2
#define OLED_SCL D1
U8G2_SH1106_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);

// ===== MQTT Config =====
const char* mqtt_server = "broker.emqx.io";
const int mqtt_port = 1883;
const char* mqtt_topic = "gpsdata";

// ===== Pin Config =====
#define LED_PIN D3 // กระพริบเมื่อส่ง MQTT

WiFiClient espClient;
PubSubClient client(espClient);

// ===== ตัวแปรเก็บค่าล่าสุด =====
int sat = 0;
float hdop = 0.0;
float speed = 0.0;
String dir = "-";

// ===== ตัวแปรหน้าจอ =====
int displayPage = 0;        // 0=เริ่มต้น, 1=WiFi Info, 2=GPS
unsigned long pageStart = 0;

void displayWiFiInfo() {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x10_tf);

  // SSID
  u8g2.setCursor(0, 12);
  u8g2.print("WiFi Connected!");
  u8g2.setCursor(0, 28);
  u8g2.print("SSID: "); u8g2.print(WiFi.SSID());

  // IP
  u8g2.setCursor(0, 40);
  u8g2.print("IP: "); u8g2.print(WiFi.localIP());

  // RSSI (ความแรงสัญญาณ)
  u8g2.setCursor(0, 52);
  u8g2.print("RSSI: "); u8g2.print(WiFi.RSSI()); u8g2.print(" dBm");

  u8g2.sendBuffer();
}

// ===== reconnect control =====
unsigned long lastReconnectAttempt = 0;
const unsigned long reconnectInterval = 5000; // พยายาม reconnect ทุก 5 วินาที

// ===== ฟังก์ชันวาด WiFi icon (ครึ่งวงโค้ง) =====
void drawWiFiIcon(int x, int y, bool connected) {
  if (connected) {
    // วาดวงโค้ง 3 ชั้น (U8g2 ใช้มุม 0..255 สำหรับ arc)
    u8g2.drawArc(x, y, 10, 0, 128); // ชั้นใหญ่
    u8g2.drawArc(x, y, 6, 0, 128);  // ชั้นกลาง
    u8g2.drawPixel(x, y);           // จุดตรงกลาง
  } else {
    // กากบาท
    u8g2.drawLine(x-5, y-5, x+5, y+5);
    u8g2.drawLine(x-5, y+5, x+5, y-5);
  }
}

// ===== ฟังก์ชันแสดงบน OLED =====
void displayData(bool wifiOK) {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x10_tf);

  // WiFi status text
  u8g2.setCursor(0, 10);
  u8g2.print("WiFi: ");
  u8g2.print(wifiOK ? "OK" : "NO");

  // SAT (ไม่ใช้ XBMP เพื่อเรียบง่าย)
  u8g2.setCursor(0, 26);
  u8g2.print("SAT: "); u8g2.print(sat);

  // HDOP
  u8g2.setCursor(0, 38);
  u8g2.print("HDOP: "); u8g2.print(hdop, 2);

  // Speed
  u8g2.setCursor(0, 50);
  u8g2.print("Speed: "); u8g2.print(speed, 2);

  // Direction
  u8g2.setCursor(72, 50);
  u8g2.print("DIR: "); u8g2.print(dir);

  // WiFi icon มุมขวาบน
  drawWiFiIcon(110, 10, wifiOK);

  u8g2.sendBuffer();
}

// ===== reconnect แบบไม่บล็อก =====
bool tryReconnectMQTT() {
  if (client.connected()) return true;
  unsigned long now = millis();
  if (now - lastReconnectAttempt > reconnectInterval) {
    lastReconnectAttempt = now;
    Serial.print("Attempt MQTT connect...");
    if (client.connect("ESP8266Client-01")) {
      Serial.println("connected");
      return true;
    } else {
      Serial.print("failed rc=");
      Serial.println(client.state());
      // ไม่บล็อก — จะลองใหม่ในรอบหน้าหลัง interval
      return false;
    }
  }
  return false;
}

// ===== ตรวจ WiFi แบบไม่บล็อก (เรียกเริ่มต้น reconnect แต่ไม่รอ) =====
bool checkWiFiNonBlocking() {
  if (WiFi.status() == WL_CONNECTED) return true;
  // ถ้ายังไม่เชื่อมให้เริ่มต้นการเชื่อม (แต่ไม่รอ)
  WiFi.begin();
  return (WiFi.status() == WL_CONNECTED);
}

void setup() {
  Serial.begin(9600);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH); // Active LOW

  Wire.begin(OLED_SDA, OLED_SCL);
  u8g2.begin();

   // แสดงข้อความชั่วคราวก่อนเชื่อม WiFi
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.setCursor(0, 20);
  u8g2.print("Starting...");
  u8g2.setCursor(0, 40);
  u8g2.print("Waiting WiFi...");
  u8g2.sendBuffer();

 // WiFiManager
  WiFiManager wifiManager;
  wifiManager.setTimeout(180);
  if (!wifiManager.autoConnect("@ESP-GPS")) {
    Serial.println("Failed WiFi, restarting...");
    u8g2.clearBuffer();
    u8g2.setCursor(0, 30);
    u8g2.print("WiFi Failed!");
    u8g2.sendBuffer();
    delay(3000);
    ESP.restart();
  }
  client.setServer(mqtt_server, mqtt_port);
  // แสดงสถานะเริ่มต้น
  displayPage = 1;
  pageStart = millis();  // บันทึกเวลาเริ่มแสดงหน้านี้
  displayWiFiInfo();

  Serial.println("WiFi Connected.");
  Serial.print("SSID: "); Serial.println(WiFi.SSID());
  Serial.print("IP: "); Serial.println(WiFi.localIP());
  Serial.print("RSSI: "); Serial.println(WiFi.RSSI());
}

void loop() {
  // เช็ค WiFi ทุกครั้ง
  bool wifiOK = checkWiFiNonBlocking();

   // --- หน้าจอสลับจาก WiFi Info → GPS ---
  if (displayPage == 1 && millis() - pageStart > 5000) {
    displayPage = 2;
    displayData(wifiOK); // แสดงทันทีว่ามี/ไม่มี WiFi
  }

  // พยายามเชื่อม MQTT แบบไม่บล็อก
  if (tryReconnectMQTT()) {
    client.loop(); // ดูแลการเชื่อมเมื่อ connected
  }

  // อ่าน Serial JSON (ถ้ามี) — อ่านและส่งทันที
  if (Serial.available()) {
    String json = Serial.readStringUntil('\n');
    json.trim();
    if (json.length() > 2 && json.startsWith("{") && json.endsWith("}")) {
      // แปลง JSON เพื่ออัปเดตค่าบนจอ
      StaticJsonDocument<256> doc;
      DeserializationError err = deserializeJson(doc, json);
      if (!err) {
        sat = doc["sat"] | 0;
        hdop = doc["hdop"] | 0.0;
        speed = doc["speed"] | 0.0;
        dir = doc["dir"] ? String((const char*)doc["dir"]) : String("-");
      } else {
        Serial.println("JSON parse error");
      }

      // ส่ง MQTT ถ้าเชื่อม 
      if (client.connected()) {
        client.publish(mqtt_topic, json.c_str());
        Serial.println("MQTT ส่ง: " + json);

        // กระพริบ LED สั้นๆ (Active LOW)
        digitalWrite(LED_PIN, LOW);
        delay(100);
        digitalWrite(LED_PIN, HIGH);
      } else {
        Serial.println("MQTT not connected, skip publish");
      }
    }
  }

      // อัปเดตหน้าจอด้วยค่าล่าสุด (wifiOK ยังแสดง)
      if (displayPage == 2) {
      displayData(wifiOK);
    }
  
  // ไม่มีการ delay ยาวๆ เพื่อให้หน้าจออัปเดตต่อเนื่อง
  delay(200); // แค่ให้ CPU หายใจ (ปรับเป็นค่าน้อยๆ ได้)
}
