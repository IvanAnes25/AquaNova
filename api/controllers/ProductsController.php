<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__) . '/v1/CommerceController.php';

final class ProductsController
{
    public function index(): never
    {
        (new CommerceController())->catalog();
    }
}
