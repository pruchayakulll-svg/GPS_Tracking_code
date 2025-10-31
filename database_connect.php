<?php 
$host = "host=localhost"; //host ที่ใช้ในการติดต่อกับ Server
$port = "port=5432"; //หมายเลข port ที่ใช้ (บางเครื่องอาจจะใช้ 5433หรือเลขอื่น)
$dbname = "dbname=IoT_gps";
$credentials = "user=postgres password=postgres";

//โครงสร้างชุดคำสั่งทำสำหรับเชื่อมต่อกับฐานข้อมูล PosgresSQL
$db=pg_connect("$host $port $dbname $credentials"); 
?>