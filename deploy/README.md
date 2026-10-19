# IQ LAND: Ubuntu, Nginx и HTTPS

Для `iq-land.academy` на VPS `92.51.21.86`. Нужен Node.js 24+, Git, Nginx, Certbot и `python3-certbot-nginx`. Команды выполняются в консоли сервера от root. При 1 ГБ RAM для сборки рекомендуется 2 ГБ swap.

## Домен

У DNS-провайдера создайте A-записи `@` и `www` на `92.51.21.86`. Удалите конфликтующие парковочные записи. Если у домена осталась AAAA-запись, она должна указывать на рабочий IPv6 этого же сервера; иначе удалите её. Почтовые записи не меняйте. В Timeweb разрешите входящие TCP 80 и 443; SSH 22 нужен при подключении через SSH.

## Подготовка и сборка

Если пользователь и репозиторий ещё не созданы:

```bash
useradd --system --create-home --home-dir /var/lib/iqland --shell /usr/sbin/nologin iqland
install -d -o iqland -g iqland -m 755 /opt/iq-land
runuser -u iqland -- git clone https://github.com/Nurmukasan/iq-land.git /opt/iq-land
```

Для уже клонированного репозитория обновите main, затем соберите:

```bash
runuser -u iqland -- git -C /opt/iq-land pull --ff-only origin main
runuser -u iqland -- bash -c 'cd /opt/iq-land && npm ci --no-audit --no-fund && npm run build'
```

## Автоматический запуск

```bash
install -d -o iqland -g iqland -m 700 /var/lib/iqland/data
install -m 644 /opt/iq-land/deploy/iqland.service /etc/systemd/system/iqland.service
systemctl daemon-reload
systemctl enable --now iqland
systemctl status iqland --no-pager
curl --fail --retry 15 --retry-delay 1 --retry-connrefused http://127.0.0.1:3001/api/health
```

SQLite, аккаунты, фотографии и монтажи находятся **в `/var/lib/iqland/data`**, вне репозитория. На пустом сервере создаётся новая база без олимпиад. Git не переносит данные с локального компьютера. Не удаляйте каталог данных при обновлении. Приложение запускается от отдельного пользователя, слушает только loopback, доверяет только локальному прокси и включает Secure-cookie.

## Nginx и сертификат

```bash
install -m 644 /opt/iq-land/deploy/nginx.conf /etc/nginx/sites-available/iqland
ln -sfn /etc/nginx/sites-available/iqland /etc/nginx/sites-enabled/iqland
nginx -t
systemctl enable --now nginx
systemctl reload nginx
```

Дождитесь, пока оба домена разрешаются в IP сервера. Если работает сторонний DNS или прокси/CDN, сначала направьте DNS напрямую на VPS. Затем:

```bash
certbot --nginx --redirect -d iq-land.academy -d www.iq-land.academy
systemctl enable --now certbot.timer
certbot renew --dry-run
curl --fail https://iq-land.academy/api/health
```

Certbot попросит контактный email и согласие с условиями Let's Encrypt. После установки сертификата открывайте сайт по **HTTPS**. Вход по обычному HTTP не сохраняет Secure-сессию.

## Первый вход

На новой базе начальные пароли можно посмотреть **только в консоли своего сервера**:

```bash
node -e 'for (const u of JSON.parse(require("node:fs").readFileSync("/var/lib/iqland/data/initial-accounts.json", "utf8"))) console.log(u.role + ": " + u.email + " / " + u.password)'
```

Не отправляйте этот вывод в чат. Аккаунты из старой базы при переносе сохраняют прежние пароли; файл первоначальных паролей может не отражать более позднюю смену пароля.

## Резервные копии и перенос

Перед запуском с реальными заявками включите внешние резервные копии/снимки диска в Timeweb и проверьте восстановление. Копии только на том же диске не защищают от потери VPS. При диске 15 ГБ следите за `df -h /`: swap занимает 2 ГБ, каждый монтаж может занимать до 1 ГБ.

Для ручного переноса или согласованной копии остановите службу `systemctl stop iqland`, скопируйте **весь** каталог данных (включая SQLite, WAL/SHM, если есть, и `uploads/`) и запустите `systemctl start iqland`. Базу с работающего локального сайта также копируйте после остановки приложения. Не подменяйте базу в работающем процессе.

## Последующие обновления

Сначала сделайте резервную копию. На малом VPS остановка приложения на время установки и сборки экономит RAM:

```bash
systemctl stop iqland
runuser -u iqland -- git -C /opt/iq-land pull --ff-only origin main
runuser -u iqland -- bash -c 'cd /opt/iq-land && npm ci --no-audit --no-fund && npm run build'
systemctl start iqland
curl --fail https://iq-land.academy/api/health
```

Если какая-либо команда завершилась ошибкой, остановитесь и устраните её до продолжения. При обычном обновлении не копируйте исходный HTTP-конфиг поверх Nginx: сертификат и HTTPS уже добавлены Certbot. Изменения прокси вносите в действующий конфиг с сохранением TLS-настроек и проверяйте `nginx -t` перед перезагрузкой.

Логи приложения: `journalctl -u iqland -n 80 --no-pager`. Состояние: `systemctl status iqland --no-pager`. Пароли, база и пользовательские файлы в Git не попадают.
