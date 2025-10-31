<?php 
$host = "host=localhost"; //host ที่ใช้ในการติดต่อกับ Server
$port = "port=5432"; //หมายเลข port ที่ใช้ (บางเครื่องอาจจะใช้ 5433หรือเลขอื่น)
$dbname = "dbname=IoT_gps";
$credentials = "user=postgres password=postgres";

//โครงสร้างชุดคำสั่งทำสำหรับเชื่อมต่อกับฐานข้อมูล PosgresSQL
$db=pg_connect("$host $port $dbname $credentials"); 

$date = $_GET['date'] ?? null;

// ถ้ามีวันที่ → เพิ่มเงื่อนไขใน SQL
if ($date) {
    $date = pg_escape_string($date);
    $sql = "SELECT *, ST_AsGeoJSON(ST_Transform(geom,4326)) as geojson 
            FROM gps_data 
            WHERE DATE(\"timestamp\") = '$date'";
} else {
    $sql = "SELECT *, ST_AsGeoJSON(ST_Transform(geom,4326)) as geojson 
            FROM gps_data";
}

// คำสั่งประมวลผลระหว่าง PHP กับ SQL 
 $query=pg_query($db,$sql);

$geojson = array(
  'type' => 'FeatureCollection',
  'features' => array()
);

while ($row = pg_fetch_assoc($query)) {
  $feature = array(
    'type' => 'Feature',
    'geometry' => json_decode($row['geojson'], true),
    'properties' => array(
      'id' => $row['id'],
      'satellites' => $row['satellites'],
      'hdop' => $row['hdop'],
      'lat' => $row['latitude'],
      'lon' => $row['longitude'],
      'date' => date('Y-m-d', strtotime($row['timestamp'])),
      'time' => date('H:i:s', strtotime($row['timestamp'])),
      'course' => $row['course'],
      'speed' => $row['speed'],
      'direction' =>$row['dir']
    )
  );
  array_push($geojson['features'], $feature);
}

pg_close($db);
echo json_encode($geojson);

?>

