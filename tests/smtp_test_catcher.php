<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli' || $argc !== 3 || !ctype_digit($argv[1])) {
    fwrite(STDERR, "Usage: php smtp_test_catcher.php <port> <capture-file>\n");
    exit(2);
}

$port = (int) $argv[1];
$captureFile = $argv[2];
$server = stream_socket_server('tcp://127.0.0.1:' . $port, $errorCode, $errorMessage);
if ($server === false) {
    fwrite(STDERR, 'Could not start SMTP catcher: ' . $errorMessage . "\n");
    exit(1);
}

fwrite(STDOUT, "SMTP catcher ready on 127.0.0.1:{$port}\n");
while ($client = @stream_socket_accept($server, 1)) {
    fwrite($client, "220 localhost ESMTP test catcher\r\n");
    $authStage = 0;
    $capturing = false;
    $message = '';

    while (($line = fgets($client)) !== false) {
        $command = strtoupper(trim($line));
        if ($capturing) {
            if ($command === '.') {
                file_put_contents($captureFile, $message . "\n---\n", FILE_APPEND | LOCK_EX);
                $message = '';
                $capturing = false;
                fwrite($client, "250 Message accepted\r\n");
            } else {
                $message .= str_starts_with($line, '..') ? substr($line, 1) : $line;
            }
        } elseif (str_starts_with($command, 'EHLO ') || str_starts_with($command, 'HELO ')) {
            fwrite($client, "250-localhost\r\n250-AUTH LOGIN\r\n250 SIZE 10485760\r\n");
        } elseif ($command === 'AUTH LOGIN') {
            $authStage = 1;
            fwrite($client, "334 VXNlcm5hbWU6\r\n");
        } elseif ($authStage === 1) {
            $authStage = 2;
            fwrite($client, "334 UGFzc3dvcmQ6\r\n");
        } elseif ($authStage === 2) {
            $authStage = 0;
            fwrite($client, "235 Authentication accepted\r\n");
        } elseif (str_starts_with($command, 'MAIL FROM:') || str_starts_with($command, 'RCPT TO:')) {
            fwrite($client, "250 OK\r\n");
        } elseif ($command === 'DATA') {
            $capturing = true;
            fwrite($client, "354 End data with <CR><LF>.<CR><LF>\r\n");
        } elseif ($command === 'RSET' || $command === 'NOOP') {
            fwrite($client, "250 OK\r\n");
        } elseif ($command === 'QUIT') {
            fwrite($client, "221 Bye\r\n");
            break;
        } else {
            fwrite($client, "502 Command not supported\r\n");
        }
    }

    fclose($client);
}

fclose($server);
