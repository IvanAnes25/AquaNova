FROM node:22-bookworm-slim AS frontend

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY webapp/package.json webapp/package-lock.json ./webapp/
RUN npm --prefix webapp ci
COPY . .
RUN npm run build

FROM php:8.3-apache-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libfreetype6-dev \
        libjpeg62-turbo-dev \
        libpng-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" gd mbstring pdo_mysql \
    && php -r 'if (!defined("PASSWORD_ARGON2ID")) { fwrite(STDERR, "PHP Argon2id support is required.\n"); exit(1); }' \
    && a2enmod headers rewrite \
    && sed -ri 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader --no-progress

COPY . .
COPY --from=frontend /app/public ./public
COPY docker/railway-entrypoint.sh /usr/local/bin/railway-entrypoint
COPY docker/railway.ini /usr/local/etc/php/conf.d/zz-aquanova.ini

RUN chmod +x /usr/local/bin/railway-entrypoint \
    && mkdir -p private/uploads/payment-proofs private/uploads/shop \
    && chown -R www-data:www-data private/uploads

ENTRYPOINT ["/usr/local/bin/railway-entrypoint"]
