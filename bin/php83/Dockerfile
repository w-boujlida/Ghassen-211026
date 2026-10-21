FROM php:8.3-apache-bookworm

# Prevent interactive prompts during package installation
ARG DEBIAN_FRONTEND=noninteractive

# Install system packages required for Oracle client and common PHP extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    libaio1 \
    unzip \
    wget \
    curl \
    zlib1g-dev \
    libzip-dev \
    libicu-dev \
    libonig-dev \
    libfreetype6-dev \
    libjpeg62-turbo-dev \
    libpng-dev \
    && rm -rf /var/lib/apt/lists/*

# Download and install the Oracle Instant Client libraries
RUN INSTANT_CLIENT_VERSION="21_13" \
    && INSTANT_CLIENT_URL="https://download.oracle.com/otn_software/linux/instantclient/2113000" \
    && mkdir -p /opt/oracle \
    && wget -O /tmp/basic.zip "${INSTANT_CLIENT_URL}/instantclient-basic-linux.x64-21.13.0.0.0dbru.zip" \
    && wget -O /tmp/sdk.zip "${INSTANT_CLIENT_URL}/instantclient-sdk-linux.x64-21.13.0.0.0dbru.zip" \
    && wget -O /tmp/sqlplus.zip "${INSTANT_CLIENT_URL}/instantclient-sqlplus-linux.x64-21.13.0.0.0dbru.zip" \
    && unzip -d /opt/oracle /tmp/basic.zip \
    && unzip -d /opt/oracle /tmp/sdk.zip \
    && unzip -d /opt/oracle /tmp/sqlplus.zip \
    && mv /opt/oracle/instantclient_${INSTANT_CLIENT_VERSION} /opt/oracle/instantclient \
    && echo /opt/oracle/instantclient > /etc/ld.so.conf.d/oracle-instantclient.conf \
    && ldconfig \
    && rm -f /tmp/*.zip

# Add Oracle client directory to the system's PATH
ENV PATH=$PATH:/opt/oracle/instantclient

# Install the required PHP extensions for Oracle and other common tasks
RUN docker-php-ext-configure oci8 --with-oci8=instantclient,/opt/oracle/instantclient \
    && docker-php-ext-configure pdo_oci --with-pdo-oci=instantclient,/opt/oracle/instantclient \
    && docker-php-ext-configure gd --enable-gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
    oci8 \
    pdo_oci \
    bcmath \
    calendar \
    exif \
    gettext \
    intl \
    mbstring \
    zip \
    gd

# Install Composer, the PHP dependency manager
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# Enable essential Apache modules for URL rewriting and headers
RUN a2enmod rewrite headers

# Set the default working directory for the container
WORKDIR /var/www/html