import { DatabaseSync } from "node:sqlite";
import { existsSync, writeFileSync, realpathSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { registrationData, erasureSummary, eraseRegistration, retentionReview } from "./privacy-records.js";

const usage = "Команды: review YYYY-MM-DD | export IQ-… /абсолютный/путь.json | erase IQ-… [--confirm IQ-…]";
let db;
try {
  const [command, value, option, confirmation, ...extra] = process.argv.slice(2);
  const validId = /^IQ-[A-F0-9]{10}$/;
  if (extra.length || !["review", "export", "erase"].includes(command) ||
      (command !== "review" && !validId.test(value || "")) ||
      (command === "review" && option !== undefined) ||
      (command === "export" && (!option || confirmation !== undefined)) ||
      (command === "erase" && option !== undefined && (option !== "--confirm" || confirmation !== value)))
    throw Error(usage);
  const path = resolve(process.env.DATA_DIR || ".data", "iqland.sqlite");
  if (!existsSync(path)) throw Error("База не найдена. Проверьте DATA_DIR; новая база не создаётся.");
  db = new DatabaseSync(path, { readOnly: command !== "erase" || option !== "--confirm" });
  db.exec("PRAGMA busy_timeout=5000");
  if (command === "review") {
    console.log(JSON.stringify(retentionReview(db, value || ""), null, 2));
  } else if (command === "export") {
    // Refuse overwrite/symlink and keep PII out of stdout and the repository.
    if (!option.startsWith("/")) throw Error("Укажите абсолютный путь вне репозитория.");
    const output = resolve(realpathSync(dirname(option)), basename(option));
    const repository = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
    if (output === repository || output.startsWith(repository + "/")) throw Error("Не сохраняйте персональные данные в репозитории.");
    writeFileSync(output, JSON.stringify(registrationData(db, value), null, 2), { flag: "wx", mode: 0o600 });
    console.log("Выгрузка записана в файл с правами 600. Передавайте только проверенному получателю и только его данные.");
  } else if (option !== "--confirm") {
    console.log(JSON.stringify({ dryRun: true, ...erasureSummary(db, value) }, null, 2));
    console.log("Ничего не удалено. После проверки оснований: erase " + value + " --confirm " + value);
  } else {
    console.log(JSON.stringify({ erased: true, ...eraseRegistration(db, value) }, null, 2));
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    console.log("Проверьте резервные копии, выгрузки и материалы мероприятия отдельно. Результаты мероприятия нужно рассчитать заново.");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  db?.close();
}
