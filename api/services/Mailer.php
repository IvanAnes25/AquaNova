<?php

declare(strict_types=1);

use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\PHPMailer;

final class MailDeliveryException extends RuntimeException
{
}

final class Mailer
{
    private static function send(string $to, string $subject, string $html, string $plain): void
    {
        // SMTP credentials come only from the private settings file.
        require_once dirname(__DIR__, 2) . '/vendor/autoload.php';

        global $authConfig;
        $mail = new PHPMailer(true);
        $settings = $authConfig['mail'];

        try {
            $mail->isSMTP();
            $mail->Host = $settings['host'];
            $mail->SMTPAuth = true;
            $mail->Username = $settings['username'];
            $mail->Password = $settings['password'];
            $mail->Port = (int) $settings['port'];
            $mail->SMTPSecure = $settings['encryption'];
            $mail->CharSet = 'UTF-8';
            $mail->setFrom($settings['from_email'], $settings['from_name']);
            $mail->addAddress($to);
            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body = $html;
            $mail->AltBody = $plain;
            $mail->send();
        } catch (Exception $exception) {
            throw new MailDeliveryException('The email could not be sent.');
        }
    }

    public static function sendVerification(string $email, string $name, string $code): void
    {
        $safeName = htmlspecialchars($name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        self::send(
            $email,
            'Your Nasugbu Aquatica verification code',
            '<p>Hello ' . $safeName . ',</p><p>Your AquaNova verification code is <strong>' . $code
                . '</strong>.</p><p>It expires in 10 minutes. If you did not request this, ignore this email.</p>',
            'Your AquaNova verification code is ' . $code . '. It expires in 10 minutes.'
        );
    }

    public static function sendPasswordReset(string $email, string $name, string $url): void
    {
        $safeName = htmlspecialchars($name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeUrl = htmlspecialchars($url, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        self::send(
            $email,
            'Reset your AquaNova password',
            '<p>Hello ' . $safeName . ',</p><p><a href="' . $safeUrl
                . '">Reset your AquaNova password</a>. This link expires in 30 minutes and works once.</p>',
            'Reset your AquaNova password using this link: ' . $url . '. It expires in 30 minutes.'
        );
    }
}
