<?php
header('Content-Type: application/json');

$host = "host=localhost";
$port = "port=5432";
$dbname = "dbname=IoT_gps";
$credentials = "user=postgres password=postgres";

$db = pg_connect("$host $port $dbname $credentials");

$date = $_GET['date'] ?? null;
$date = trim($date);

if (!$date) {
// ถ้าไม่มีวันที่ส่งมา ให้ส่ง GeoJSON เปล่า
    echo json_encode([
        'line' => ['type' => 'FeatureCollection', 'features' => []],
        'points' => ['type' => 'FeatureCollection', 'features' => []]
    ]);
    exit;
}

$date_escaped = pg_escape_string($date);

$sql_line = "SELECT ST_AsGeoJSON(ST_Transform(ST_MakeLine(geom ORDER BY \"timestamp\"), 4326)) AS geojson
             FROM gps_data
             WHERE DATE(\"timestamp\") = '$date_escaped'";

$sql_points = "SELECT *, ST_AsGeoJSON(ST_Transform(geom,4326)) as geojson
               FROM gps_data
               WHERE DATE(\"timestamp\") = '$date_escaped'";

$sql_garbage = "SELECT id, gps_id, latitude, longitude, detected_time, name,
                       ST_AsGeoJSON(ST_Transform(geom,4326)) as geojson
                FROM garbage_point
                WHERE DATE(detected_time) = '$date_escaped'";

$result_line = pg_query($db, $sql_line);
$result_points = pg_query($db, $sql_points);
$result_garbage = pg_query($db, $sql_garbage);

$line_geojson = ['type' => 'FeatureCollection', 'features' => []];
$points_geojson = ['type' => 'FeatureCollection', 'features' => []];
$garbage_geojson = ['type' => 'FeatureCollection', 'features' => []];

if ($result_line && $row_line = pg_fetch_assoc($result_line)) {
    if ($row_line['geojson']) {
        $line_geojson['features'][] = [
            'type' => 'Feature',
            'geometry' => json_decode($row_line['geojson'], true),
            'properties' => ['description' => "เส้นทางรถเก็บขยะวันที่ $date"]
        ];
    }
}

if ($result_points) {
    while ($row = pg_fetch_assoc($result_points)) {

        $timeFormatted = date('Y-m-d H:i:s', strtotime($row['timestamp']));
        $points_geojson['features'][] = [
            'type' => 'Feature',
            'geometry' => json_decode($row['geojson'], true),
            'properties' => [
                'time' => $timeFormatted,
                'lat' => $row['latitude'] ?? null,
                'lon' => $row['longitude'] ?? null,
                'speed' => $row['speed'] ?? null,
                'satellites' => $row['satellites'] ?? null,
                'course' => $row['course'] ?? 0  
            ]
        ];
    }
}

if ($result_garbage) {
    while ($row = pg_fetch_assoc($result_garbage)) {
    $geometry = json_decode($row['geojson'], true);
    $coordinates = $geometry['coordinates']; 

    $garbage_geojson['features'][] = [
        'type' => 'Feature',
        'geometry' => $geometry,
        'properties' => [
            'id' => $row['id'],
            'gps_id' => $row['gps_id'],
            'latitude' => $coordinates[1],  
            'longitude' => $coordinates[0], 
            'detected_time' => $row['detected_time'],
            'name' => $row['name']
            ]
        ];
    }
}

// --- เพิ่มคำนวณ stop_count ---
$stop_count = count($garbage_geojson['features']);
$total_minutes = 0;
// เพิ่มค่าไปใน properties ของ line
if ($line_geojson['features']) {
    $line_geojson['features'][0]['properties']['stop_count'] = $stop_count;
}


//  SUMMARY  //

// 1. ระยะทางรวม (หน่วย km)
$sql_distance = "SELECT 
    ST_Length(ST_Transform(ST_MakeLine(geom ORDER BY timestamp), 32647)) / 1000 AS distance_km
    FROM gps_data
    WHERE DATE(timestamp) = '$date_escaped'";
$result_distance = pg_query($db, $sql_distance);
$row_distance = pg_fetch_assoc($result_distance);
$distance_km = round($row_distance['distance_km'] ?? 0, 2);

// 2. เวลาเดินรถรวม
$sql_duration = "SELECT 
    to_char(MAX(timestamp) - MIN(timestamp), 'HH24:MI:SS') AS total_duration
    FROM gps_data
    WHERE DATE(timestamp) = '$date_escaped'";
$result_duration = pg_query($db, $sql_duration);
$row_duration = pg_fetch_assoc($result_duration);
$total_duration = $row_duration['total_duration'] ?? "00:00:00";

// 3. Overspeed %
$sql_overspeed = "SELECT 
    (COUNT(*) FILTER (WHERE speed > 60) * 100.0 / COUNT(*)) AS overspeed_percent
    FROM gps_data
    WHERE DATE(timestamp) = '$date_escaped'";
$result_overspeed = pg_query($db, $sql_overspeed);
$row_overspeed = pg_fetch_assoc($result_overspeed);
$overspeed_percent = round($row_overspeed['overspeed_percent'] ?? 0, 1);

// 4. ความเร็วเฉลี่ย
$sql_avg_speed = "SELECT AVG(speed) AS avg_speed
    FROM gps_data
    WHERE DATE(timestamp) = '$date_escaped'";
$result_avg_speed = pg_query($db, $sql_avg_speed);
$row_avg_speed = pg_fetch_assoc($result_avg_speed);
$avg_speed = round($row_avg_speed['avg_speed'] ?? 0, 1);

// 5. จำนวนจุดเก็บขยะ
$sql_garbage_count = "SELECT COUNT(*) AS garbage_count
    FROM garbage_point
    WHERE DATE(detected_time) = '$date_escaped'";
$result_garbage_count = pg_query($db, $sql_garbage_count);
$row_garbage_count = pg_fetch_assoc($result_garbage_count);
$garbage_count = (int) ($row_garbage_count['garbage_count'] ?? 0);

// รวมเป็น Summary
$summary = [
    'date' => $date,
    'distance_km' => $distance_km,
    'total_duration' => $total_duration,
    'overspeed_percent' => $overspeed_percent,
    'avg_speed' => $avg_speed,
    'garbage_count' => $garbage_count
];

//////////////////////////////////////////
pg_close($db);

echo json_encode([
    'line' => $line_geojson,
    'points' => $points_geojson,
    'garbage_point' => $garbage_geojson,
    'summary' => $summary
]);

