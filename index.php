<?php
$frontend = __DIR__ . '/public/index.html';

if (!is_file($frontend)) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Frontend build not found. Run npm install and npm run build.\n";
    exit;
}

readfile($frontend);