<?php

final class HealthController
{
    public function index(): void
    {
        header('Content-Type: application/json; charset=utf-8');

        echo json_encode([
            'status' => 'ok',
            'message' => 'Plain PHP backend is responding.',
        ]);
    }
}
