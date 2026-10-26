<?php
header('Content-Type: application/json; charset=utf-8');

$products = [
    [
        'id' => 'betta-red',
        'name' => 'Red Betta',
        'category' => 'Fish',
        'price' => 320,
        'size' => '2.5 in',
        'availability' => 'In stock',
        'image' => 'https://images.unsplash.com/photo-1544551763-46a013bb70b5?auto=format&fit=crop&w=900&q=80',
        'description' => 'Bright color and easy temperament for beginner aquariums.'
    ],
    [
        'id' => 'guppy-spark',
        'name' => 'Spark Guppy',
        'category' => 'Fish',
        'price' => 180,
        'size' => '1.5 in',
        'availability' => 'Limited',
        'image' => 'https://images.unsplash.com/photo-1522069169874-c58ec4b76be5?auto=format&fit=crop&w=900&q=80',
        'description' => 'Colorful community fish for planted and active tanks.'
    ],
    [
        'id' => 'goldfish-oranda',
        'name' => 'Oranda Goldfish',
        'category' => 'Fish',
        'price' => 450,
        'size' => '4 in',
        'availability' => 'Ask to confirm',
        'image' => 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=900&q=80',
        'description' => 'A favorite for calm, spacious home aquariums.'
    ],
    [
        'id' => 'aquarium-30g',
        'name' => '30-Gallon Aquarium',
        'category' => 'Aquariums',
        'price' => 6800,
        'size' => '30 gal',
        'availability' => 'Available',
        'image' => 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=900&q=80',
        'description' => 'A clean setup for new hobbyists and small collections.'
    ],
    [
        'id' => 'aquarium-60g',
        'name' => '60-Gallon Aquarium',
        'category' => 'Aquariums',
        'price' => 12700,
        'size' => '60 gal',
        'availability' => 'Ask to confirm',
        'image' => 'https://images.unsplash.com/photo-1535591273668-578e31182c4f?auto=format&fit=crop&w=900&q=80',
        'description' => 'Perfect for larger fish displays and premium layouts.'
    ],
    [
        'id' => 'filter-kit',
        'name' => 'Starter Filter Kit',
        'category' => 'Accessories',
        'price' => 960,
        'size' => 'Standard',
        'availability' => 'In stock',
        'image' => 'https://images.unsplash.com/photo-1570288686795-53f8d4b0d4d5?auto=format&fit=crop&w=900&q=80',
        'description' => 'Simple filtration and maintenance essentials for healthy tanks.'
    ],
];

echo json_encode(['products' => $products], JSON_PRETTY_PRINT);
