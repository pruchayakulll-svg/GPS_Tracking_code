// Initialize Leaflet Map
var map = L.map("map").setView([16.7476, 100.1937], 15);

// OpenStreetMap Tile Layer
var osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 20,
  attribution: "© OpenStreetMap contributors",
});

// Google Satellite Tile Layer
var googleSat = L.tileLayer(
  "http://{s}.google.com/vt?lyrs=s&x={x}&y={y}&z={z}",
  {
    maxZoom: 20,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
  }
);

googleSat.addTo(map); // Add satellite map as default

// GeoJSON Layer for Points (e.g., garbage collection points)
var pointLayer = L.geoJSON(null, {
  onEachFeature: function (feature, layer) {
    let p = feature.properties;
    let popup = `
      <b>เวลา:</b> ${p.date} ${p.time}<br/>
      <b>ดาวเทียม:</b> ${p.satellites}<br/>
      <b>ความเร็ว:</b> ${p.speed} km/h<br/>
      <b>พิกัด:</b> ${p.lat}, ${p.lon}`;
    layer.bindPopup(popup);
  },
  pointToLayer: function (feature, latlng) {
    return L.circleMarker(latlng, {
      radius: 5,
      color: "blue",
      fillOpacity: 0.7,
    });
  },
});

// GeoJSON Layer for Lines (e.g., truck routes)
var lineLayer = L.geoJSON(null, {
  style: {
    color: "red",
    weight: 4,
    opacity: 0.8,
  },
  onEachFeature: function (feature, layer) {
    let desc = feature.properties.description || "เส้นทาง";
    layer.bindPopup(`<b>${desc}</b>`);
  },
});

/////////////////////////////////////
var garbageLayer = L.geoJSON(null, {
  pointToLayer: function (feature, latlng) {
    return L.marker(latlng, {
      icon: L.icon({
        iconUrl: "trashbin.png",
        iconSize: [25, 25],
        iconAnchor: [12, 25],
      }),
    });
  },
  onEachFeature: function (feature, layer) {
    const p = feature.properties;

    // ดึงทุก garbage point มา
    const allPoints = garbageLayer.toGeoJSON().features;

    // --- หาจุดที่พิกัดตรงกัน ---
    const samePoints = allPoints.filter((f) => {
      return (
        f.geometry.coordinates[0] === feature.geometry.coordinates[0] &&
        f.geometry.coordinates[1] === feature.geometry.coordinates[1]
      );
    });

    const stopCount = samePoints.length;

    let durationText = "";
    if (samePoints.length > 1) {
      samePoints.sort(
        (a, b) =>
          parseTimeToMs(a.properties.detected_time) -
          parseTimeToMs(b.properties.detected_time)
      );

      const start = parseTimeToMs(samePoints[0].properties.detected_time);
      const end = parseTimeToMs(
        samePoints[samePoints.length - 1].properties.detected_time
      );
      const duration = end - start;

      durationText = `<br/><b>เวลาจอดรวม:</b> ${formatDuration(duration)}`;
    } else {
      // ถ้าเป็นจุดเดี่ยว → แสดงว่า "0 วินาที" (หรือจอดน้อยกว่า 1 วินาที)
      durationText = `<br/><b>เวลาจอด:</b> 0 วินาที`;
    }

    let timeStr = p.detected_time.split(".")[0];

    layer.bindPopup(`
      <b>ชื่อ:</b> ${p.name}<br/>
      <b>เวลา:</b> ${timeStr}<br/>
      <b>พิกัด:</b> ${p.latitude}, ${p.longitude}
      <b>จำนวนครั้งที่จอด:</b> ${stopCount}
      ${durationText}
    `);
  },
});

// GeoJSON Layer for Thatong landmarks
var thathongLayer = L.geoJSON(null);
var iconLocation = L.icon({
  iconUrl: "Redmark.png",
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
});

fetch("thathong.geojson")
  .then((res) => res.json())
  .then((data) => {
    thathongLayer.addData(data);
    thathongLayer.eachLayer(function (layer) {
      var name = layer.feature?.properties?.name || "ไม่มีชื่อ";
      layer.bindPopup("<b>สถานที่:</b> " + name);
      if (layer.setIcon) {
        layer.setIcon(iconLocation);
      }
    });
    map.addLayer(thathongLayer);
  })
  .catch((e) => {
    console.error("Error loading thathong.geojson:", e);
    showMessageBox("ไม่สามารถโหลดข้อมูลสถานที่สำคัญได้");
  });

// Base Map Layers Control
var baseMaps = {
  OpenStreetMap: osm,
  ภาพถ่ายดาวเทียม: googleSat,
};

// Overlay Map Layers Control
var overlayMaps = {
  จุดรถวิ่ง: pointLayer,
  เส้นทางรถ: lineLayer,
  สถานที่สำคัญ: thathongLayer,
  จุดถังขยะ: garbageLayer,
};

L.control.layers(baseMaps, overlayMaps).addTo(map);

// Custom Message Box Functions (replacing alert())
function showMessageBox(message) {
  document.getElementById("messageText").innerText = message;
  document.getElementById("messageBox").style.display = "flex";
}

function hideMessageBox() {
  document.getElementById("messageBox").style.display = "none";
}

// Function to load data based on selected date and vehicle
function loadData() {
  var date = document.getElementById("dateInput").value;
  var selectedVehicle = document.getElementById("vehicleSelect").value;

  if (!date) {
    showMessageBox("กรุณาเลือกวันที่ก่อน");
    return;
  }

  // Construct URL for fetching data
  var url = `http://localhost/GPS_Tracking/get_gps_data.php?date=${date}`;
  if (selectedVehicle !== "all") {
    // url += `&vehicle=${selectedVehicle}`;
  }

  pointLayer.clearLayers();
  lineLayer.clearLayers();
  garbageLayer.clearLayers();

  fetch(url)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then((data) => {
      if (data.line) {
        lineLayer.addData(data.line);
        map.addLayer(lineLayer);

        // เพิ่ม popup แสดงจำนวนครั้งจอดและเวลาจอดรวม
        lineLayer.eachLayer(function (layer) {
          const p = layer.feature.properties;
          const stopCount = p.stop_count ?? 0;
          layer.bindPopup(
            `<b>${p.description}</b><br>
             จำนวนครั้งจอด: ${stopCount}<br>`
          );
        });
      }
      /////////////////////////////////
      if (data.points) {
        pointLayer.addData(data.points);
        map.addLayer(pointLayer);

        if (pointLayer.getLayers().length > 0) {
          map.fitBounds(pointLayer.getBounds());
        }

        //  สร้างกราฟ speed vs time ตรงนี้
        renderSpeedChart(data.points.features);
      }

      if (data.garbage_point) {
        garbageLayer.clearLayers();
        garbageLayer.addData(data.garbage_point);
        map.addLayer(garbageLayer);
      } else {
        showMessageBox("ไม่พบข้อมูลสำหรับวันที่เลือก");
      }
    })
    .catch((e) => {
      console.error("โหลดข้อมูลผิดพลาด:", e);
      showMessageBox("เกิดข้อผิดพลาดในการโหลดข้อมูล: " + e.message);
    });
}

// Vehicle Selection Handler
function onVehicleChange() {
  const selectedVehicle = document.getElementById("vehicleSelect").value;
  console.log("Selected Vehicle:", selectedVehicle);
  // In a real application, you would re-load data specific to this vehicle
  // loadData(); // Uncomment if you want to auto-load data on vehicle change
}

// Live Tracking
let liveTrackingInterval;
let isLiveTrackingActive = false;
let vehicleMarker;

// ฟังก์ชันแปลงเวลา UTC -> เวลาไทย (UTC+7)
function convertToThaiTime(dateStr, timeStr) {
  const [day, month, year] = dateStr.split("/").map(Number);
  const [hh, mm, ss] = timeStr.split(":").map(Number);

  let localDate = new Date(year, month - 1, day, hh, mm, ss);

  localDate.setHours(localDate.getHours() + 7);

  // format HH:MM:SS
  const hh2 = String(localDate.getHours()).padStart(2, "0");
  const mm2 = String(localDate.getMinutes()).padStart(2, "0");
  const ss2 = String(localDate.getSeconds()).padStart(2, "0");

  return `${hh2}:${mm2}:${ss2}`;
}

function toggleLiveTracking() {
  const button = document.getElementById("liveTrackingBtn");

  if (isLiveTrackingActive) {
    clearInterval(liveTrackingInterval);
    isLiveTrackingActive = false;

    // ลบ marker ออกจากแผนที่
    if (vehicleMarker) {
      map.removeLayer(vehicleMarker);
      vehicleMarker = null;
    }

    button.innerText = "เริ่มติดตามสด";
    button.style.backgroundColor = "#ffdd57";
    button.style.color = "#4b3678";
    showMessageBox("หยุดการติดตามสดแล้ว");
  } else {
    // --- เคลียร์เลเยอร์ทั้งหมดก่อนเริ่มติดตามสด ---
    pointLayer.clearLayers();
    lineLayer.clearLayers();
    garbageLayer.clearLayers();

    liveTrackingInterval = setInterval(() => {
      fetch("http://127.0.0.1:1880/api/gpsdata")
        .then((res) => res.json())
        .then((data) => {
          console.log("Latest GPS data:", data);

          const lat = parseFloat(data.lat);
          const lon = parseFloat(data.lon);
          const course = parseFloat(data.course) || 0;

          // เลือกสีตาม status
          const statusColor = data.status === "จุดเก็บขยะ" ? "red" : "green";

          const thaiTime = convertToThaiTime(data.date, data.time);

          const popupContent = `
          <b>สถานะ:</b> 
          <span style="
            display:inline-block;
            width:12px;
            height:12px;
            border-radius:50%;
            background-color:${statusColor};
            margin-right:5px;
          "></span>
          ${data.status}<br/>
          <b>ความเร็ว:</b> ${data.speed} km/h<br/>
          <b>เวลา:</b> ${thaiTime}<br/>
          <b>ดาวเทียม:</b> ${data.sat}, HDOP: ${data.hdop}
          <b>Course:</b> ${data.course}°
        `;

          if (!vehicleMarker) {
            const vehicleIcon = L.icon({
              iconUrl: "truck_topview.png", // ใช้ไอคอน top view
              iconSize: [50, 50],
              iconAnchor: [25, 25], // หมุนรอบกลาง icon
            });

            vehicleMarker = L.marker([lat, lon], {
              icon: vehicleIcon,
              rotationAngle: course, // หมุนตาม course
              rotationOrigin: "center center",
            })
              .addTo(map)
              .bindPopup(popupContent)
              .openPopup();
          } else {
            vehicleMarker.setLatLng([lat, lon]);
            vehicleMarker.setRotationAngle(course); // อัปเดตทิศทาง
            vehicleMarker.setPopupContent(popupContent);
          }

          map.panTo([lat, lon]);
        })
        .catch((err) => {
          console.error("Error fetching live data:", err);
          showMessageBox("ไม่สามารถดึงข้อมูลสดได้");
        });
    }, 1000); // ทุก 1 วินาที

    isLiveTrackingActive = true;
    button.innerText = "หยุดติดตามสด";
    button.style.backgroundColor = "#f0c90f";
    button.style.color = "#4b3678";
  }
}

// Route Playback
let playbackInterval;
let isPlaying = false;
let currentPlaybackIndex = 0;
let playbackData = []; // Store the points for playback
let playbackMarker = null;

function togglePlayback() {
  const playPauseBtn = document.getElementById("playPauseBtn");

  if (isPlaying) {
    clearInterval(playbackInterval);
    isPlaying = false;
    playPauseBtn.innerText = "เล่น";
    showMessageBox("หยุดเล่นเส้นทาง");
    if (playbackMarker) {
      map.removeLayer(playbackMarker);
      playbackMarker = null;
    }
  } else {
    if (pointLayer.getLayers().length === 0) {
      showMessageBox("กรุณาโหลดข้อมูลเส้นทางก่อนเริ่มดูย้อนหลัง");
      return;
    }

    playbackData = pointLayer.toGeoJSON().features;
    currentPlaybackIndex = 0;

    playbackInterval = setInterval(() => {
      if (currentPlaybackIndex < playbackData.length) {
        const point = playbackData[currentPlaybackIndex];
        const coords = point.geometry.coordinates;
        const latlng = [coords[1], coords[0]];
        const course = parseFloat(point.properties.course) || 0;

        if (!playbackMarker) {
          playbackMarker = L.marker(latlng, {
            icon: L.icon({
              iconUrl: "truck_topview.png", // ใช้ top view icon
              iconSize: [50, 50], // ปรับขนาดตามต้องการ
              iconAnchor: [25, 25], // จุดหมุนตรงกลาง icon
            }),
            rotationAngle: course, // หมุนตามค่า course
            rotationOrigin: "center center",
          })
            .addTo(map)
            .bindPopup(
              `เวลา: ${point.properties.time}<br>
           ความเร็ว: ${point.properties.speed || 0} km/h<br>
           Course: ${course}°`
            )
            .openPopup();
          // ไม่เรียก openPopup() → popup จะไม่เปิดเอง
        } else {
          playbackMarker
            .setLatLng(latlng)
            .setRotationAngle(course)
            .bindPopup(
              `เวลา: ${point.properties.time}<br>
               ความเร็ว: ${point.properties.speed || 0} km/h<br>
               Course: ${course}°`
            );
        }

        currentPlaybackIndex++;
      } else {
        clearInterval(playbackInterval);
        isPlaying = false;
        playPauseBtn.innerText = "เล่น";

        showMessageBox("เล่นเส้นทางจบแล้ว จะเริ่มใหม่อีก 10 วินาที...");

        // รอ 10 วิแล้วเริ่มใหม่
        setTimeout(() => {
          if (!isPlaying) {
            // ถ้ายังไม่ถูกหยุดด้วยมือ
            currentPlaybackIndex = 0;
            togglePlayback();
          }
        }, 10000);
      }
    }, 1000 / parseFloat(document.getElementById("playbackSpeed").value));

    isPlaying = true;
    playPauseBtn.innerText = "หยุด";
    showMessageBox("กำลังเล่นเส้นทาง...");
  }
}
// ฟังก์ชันอัปเดตค่าความเร็ว playback
function updatePlaybackSpeed(value) {
  const speedLabel = document.getElementById("speedValue");
  speedLabel.innerText = value + "x"; // เช่น "1x", "1.5x", "2x"
}

//////////////////////////////////////////////////////////////////////////////////
let heatLayer = null;
let garbageMarkers = []; // เก็บ marker

function renderGarbageHeatmap() {
  const date = document.getElementById("dateInput").value;
  if (!date) {
    showMessageBox("กรุณาเลือกวันที่");
    return;
  }

  function clearHeatmap(showMsg = true) {
    if (heatLayer) {
      map.removeLayer(heatLayer);
      heatLayer = null;
      document.getElementById("totalPoints").innerText = 0;

      if (showMsg) {
        showMessageBox("เคลียร์ Heatmap เรียบร้อยแล้ว");
      }
    }
  }

  fetch(`http://localhost/GPS_Tracking/get_gps_data.php?date=${date}`)
    .then((res) => res.json())
    .then((data) => {
      const garbageData = data.garbage_point;
      if (!garbageData?.features?.length) {
        showMessageBox("ไม่พบข้อมูลจุดเก็บขยะ");
        return;
      }

      const validFeatures = garbageData.features.filter(
        (f) => f.geometry?.coordinates
      );
      if (!validFeatures.length) {
        showMessageBox("ไม่พบจุดเก็บขยะที่มีพิกัด");
        return;
      }

      // --- เคลียร์ heatmap และ markers เดิม ---
      if (heatLayer) {
        map.removeLayer(heatLayer);
        heatLayer = null;
      }
      markerLayer.clearLayers(); // <<< ลบ marker เดิมทั้งหมด

      // --- Heatmap ---
      heatLayer = L.heatLayer(
        validFeatures.map((f) => [
          f.geometry.coordinates[1],
          f.geometry.coordinates[0],
          1,
        ]),
        { radius: 25, blur: 15, maxZoom: 17 }
      ).addTo(map);

      document.getElementById("totalPoints").innerText = validFeatures.length;

      map.fitBounds(
        validFeatures.map((f) => [
          f.geometry.coordinates[1],
          f.geometry.coordinates[0],
        ])
      );

      // --- Markers ---
      validFeatures.forEach((f) => {
        const latlng = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
        L.circleMarker(latlng, { radius: 5, color: "red", fillOpacity: 0.7 })
          .bindPopup(
            `ชื่อจุด: ${f.properties.name}<br>เวลา: ${f.properties.detected_time}`
          )
          .addTo(markerLayer); // <<< เพิ่มลง LayerGroup
      });
    })
    .catch((err) => {
      console.error(err);
      showMessageBox("โหลดข้อมูลผิดพลาด");
    });
}

// Clear MAP  Everythings //
function clearMap() {
  // ลบเลเยอร์ map ต่าง ๆ
  if (pointLayer) pointLayer.clearLayers();
  if (lineLayer) lineLayer.clearLayers();
  if (garbageLayer) garbageLayer.clearLayers();
  if (heatLayer) map.removeLayer(heatLayer);
  if (markerLayer) markerLayer.clearLayers();
  if (chartHighlightLayer) chartHighlightLayer.clearLayers();

  // Playback
  if (playbackInterval) clearInterval(playbackInterval);
  if (playbackMarker) map.removeLayer(playbackMarker);
  isPlaying = false;
  document.getElementById("playPauseBtn").innerText = "เล่น";

  // LiveTracking
  if (liveTrackingInterval) clearInterval(liveTrackingInterval);
  if (vehicleMarker) map.removeLayer(vehicleMarker);
  isLiveTrackingActive = false;
  document.getElementById("liveTrackingBtn").innerText = "เริ่มติดตามสด";

  showMessageBox("เคลียร์แผนที่เรียบร้อยแล้ว");
}

// CHART show in leaflet open/close //
let chartData = { labels: [], speeds: [] };
let miniChart = null;
let largeChart = null;

function renderSpeedChart(features) {
  const labels = features.map((f) => f.properties.time);
  const speeds = features.map((f) => parseFloat(f.properties.speed) || 0);

  chartData.labels = labels;
  chartData.speeds = speeds;

  //  สร้างข้อมูลใหม่สำหรับ speed > 60
  const over60 = speeds.map((s) => (s > 60 ? s : null));

  const ctx = document.getElementById("speedChart").getContext("2d");
  if (miniChart) miniChart.destroy();

  const over60Count = speeds.filter((s) => s > 60).length;

  // mini chart
  miniChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Speed (km/hr)",
          data: speeds,
          borderColor: "blue",
          backgroundColor: "rgba(0,0,255,0.1)",
          tension: 0.3,
          pointRadius: 2,
        },
        {
          label: "Speed > 60",
          data: over60, // ✅ dataset นี้มาไว้หลัง
          borderColor: "red",
          backgroundColor: "rgba(255,0,0,0.1)",
          tension: 0.3,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `Overspeed Points: ${over60Count}`, // ✅ โชว์จำนวน
          color: "red",
          font: { size: 14, weight: "bold" },
        },
      },
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        highlightOnMap(idx);
      },
    },
  });
}

function openChartModal() {
  const modal = document.getElementById("chartModal");
  modal.style.display = "flex"; // ใช้ flex เพื่อ center content
  const ctxLarge = document.getElementById("speedChartLarge").getContext("2d");

  if (largeChart) largeChart.destroy();

  // เตรียมข้อมูล
  const overspeed = chartData.speeds.map((s) => (s > 60 ? s : null));
  const overspeedCount = overspeed.filter((s) => s !== null).length;

  largeChart = new Chart(ctxLarge, {
    type: "line",
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: "Speed > 60 km/h",
          data: overspeed,
          borderColor: "red",
          backgroundColor: "rgba(255,0,0,0.2)",
          pointRadius: 4,
          fill: true,
          tension: 0.3,
        },
        {
          label: "Speed",
          data: chartData.speeds,
          borderColor: "green",
          backgroundColor: "rgba(0,255,0,0.1)",
          pointRadius: 3,
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `Overspeed Points: ${overspeedCount}`,
          color: "red",
          font: { size: 16, weight: "bold" },
        },
      },
      scales: {
        x: { title: { display: true, text: "เวลา" } },
        y: {
          title: { display: true, text: "Speed (km/h)" },
          beginAtZero: true,
        },
      },
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        highlightOnMap(idx);
      },
    },
  });
}

function closeChartModal() {
  const modal = document.getElementById("chartModal");
  modal.style.display = "none";
}

///////////////////////////
let markerLayer = L.layerGroup().addTo(map);
let chartHighlightLayer = L.layerGroup().addTo(map);

function highlightOnMap(index) {
  const features = pointLayer.toGeoJSON().features;
  if (!features || !features[index]) return;

  const feature = features[index];
  const latlng = [
    feature.geometry.coordinates[1],
    feature.geometry.coordinates[0],
  ];

  // Zoom map ไปยังจุด
  map.setView(latlng, 17);

  // แสดง popup ชั่วคราว
  const popup = L.popup()
    .setLatLng(latlng)
    .setContent(
      `<b>เวลา:</b> ${feature.properties.time}<br>
       <b>Speed:</b> ${feature.properties.speed} km/h`
    )
    .openOn(map);

  // หรือใส่ marker ชั่วคราว
  L.circleMarker(latlng, {
    radius: 10,
    color: "red",
    fillOpacity: 0.7,
  }).addTo(chartHighlightLayer);
}

//////////////////  Gargabe_point สรุป เวลา  //////////////////////////////////////
// ฟังก์ชันแปลงเวลาเป็น milliseconds
function parseTimeToMs(timeStr) {
  return new Date(timeStr).getTime();
}

// ฟังก์ชันหาความต่างเวลาเป็นนาที/วินาที
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  if (minutes > 0) {
    return `${minutes} นาที ${remainSec} วินาที`;
  } else {
    return `${remainSec} วินาที`;
  }
}

// Summary Data  //
function showDailySummary() {
  console.log("showDailySummary called");
  const date = document.getElementById("dateInput").value;
  console.log("Selected date:", date);
  if (!date) {
    showMessageBox("กรุณาเลือกวันที่ก่อน");
    return;
  }

  const box = document.getElementById("summaryBox");
  if (!box) return;

  // เรียกข้อมูลจาก PHP
  fetch(`http://localhost/GPS_Tracking/get_gps_data.php?date=${date}`)
    .then((res) => res.json())
    .then((data) => {
      console.log("Data received:", data);
      if (!data || !data.summary) {
        showMessageBox("ไม่พบข้อมูลสรุปสำหรับวันที่เลือก");
        return;
      }

      const s = data.summary;

      box.classList.remove("hidden");
      box.innerHTML = `
        <b>📅 สรุปผลการเดินรถวันที่ ${s.date}</b><br>
        🛣 <b>ระยะทางรวม:</b> ${s.distance_km.toFixed(2)} km<br>
        ⏱ <b>เวลาเดินรถ:</b> ${s.total_duration}<br>
        🚨 <b>Overspeed:</b> ${s.overspeed_percent.toFixed(1)}%<br>
        ⚙️ <b>ความเร็วเฉลี่ย:</b> ${s.avg_speed.toFixed(1)} km/h<br>
        🗑 <b>จำนวนจุดเก็บขยะ:</b> ${s.garbage_count} จุด<br>
        <button onclick="hideDailySummary()" class="mt-2 w-full bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-2 rounded-md">ปิด</button>
      `;
    })
    .catch((err) => {
      console.error(err);
      showMessageBox("เกิดข้อผิดพลาดในการดึงข้อมูลสรุป");
    });
}

function hideDailySummary() {
  const box = document.getElementById("summaryBox");
  box.classList.add("hidden");
}
