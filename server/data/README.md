# Country database

`user-country.mmdb.gz` is a gzip-compressed, otherwise unmodified copy of the
user-country IPv4+IPv6 MMDB from the official sapics/ip-location-db release.
The publisher recommends this dataset for approximate end-user country lookup.
Source, snapshot date, SHA-256, compressed SHA-256 and license are recorded in
`country-database.json`. The uncompressed hash was checked against the digest
published by GitHub for the release asset, and is verified again at startup.

License: Public Domain Dedication and License v1.0 (PDDL-1.0):
https://opendatacommons.org/licenses/pddl/1-0/
The publisher permits free use and redistribution without attribution:
https://github.com/sapics/ip-location-db#license

The database is bundled so server startup and language detection work without
network access, license keys, caches or install scripts. IP addresses are never
submitted to this publisher. No city or precise coordinates are collected.

For updates, retrieve the current official `user-country.mmdb` release and its
GitHub SHA-256 digest, verify the downloaded bytes before gzip compression,
update the manifest, then run `npm test`. Do not use the deprecated npm country
snapshots, which the publisher has withdrawn due to data bugs and license issues.
