<?php

// Copy this file to auth.php and replace every placeholder.
// Keep auth.php out of Git and outside the public web directory.
return [
    'environment' => 'local',
    'app_url' => 'http://localhost/AquaNova',
    'app_key' => 'REPLACE_WITH_OUTPUT_OF_php_-r_"echo_bin2hex(random_bytes(32));"',
    'trust_proxy_https' => false,
    'database' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'aquanova',
        'username' => 'root',
        'password' => '',
    ],
    'argon2' => [
        'memory_cost' => 32768,
        'time_cost' => 3,
        'threads' => 1,
    ],
    'dummy_password_hash' => '$argon2id$v=19$m=32768,t=3,p=1$VVRmUExpelR2NEtYNWF0dA$Lb1NZ7TcEyTKsdCqQ2Ta1teil/hkXQvGwLGMgDa7YEc',
    'mail' => [
        'host' => 'smtp.example.com',
        'port' => 587,
        'username' => 'your-mailbox@example.com',
        'password' => 'REPLACE_WITH_SMTP_PASSWORD',
        'encryption' => 'tls',
        'from_email' => 'your-mailbox@example.com',
        'from_name' => 'Nasugbu Aquatica',
    ],
];
