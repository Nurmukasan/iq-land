import { z } from "zod";
import { isExistingEventImage } from "./event-images.js";
import { isExistingEventVideo } from "./event-videos.js";
import { normalizeTelegramUrl } from "../shared/telegram.js";
import { existingDocument } from "./event-documents.js";
import { MAX_EVENT_DOCUMENTS } from "../shared/event-documents.js";
import { PRIVACY_VERSION } from "../shared/privacy.js";
export { normalizeTelegramUrl } from "../shared/telegram.js";
const text = (max = 150) =>
  z
    .string()
    .trim()
    .min(2, "Заполните поле (минимум 2 символа)")
    .max(max, `Не более ${max} символов`);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату")
  .refine((v) => {
    const d = new Date(v);
    return !isNaN(d) && d.toISOString().slice(0, 10) === v;
  }, "Некорректная дата");

const telegramUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) => normalizeTelegramUrl(value) !== null,
    "Вставьте HTTPS-ссылку на Telegram-канал вида https://t.me/… или оставьте поле пустым",
  )
  .transform(normalizeTelegramUrl)
  .optional();
export const registrationSchema = z.object({
  eventId: text(),
  center: text(),
  city: text(),
  teacher: text(),
  email: z.email("Проверьте email").max(200),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s()\-]{7,25}$/, "Проверьте номер телефона")
    .refine((value) => { const count = value.replace(/\D/g, "").length; return count >= 7 && count <= 15; }, "Проверьте номер телефона"),
  teachers: z.array(text()).max(30).default([]),
  note: z.string().trim().max(2000).default(""),
  consent: z.literal(true, "Подтвердите согласие на обработку данных"),
  privacyVersion: z.literal(PRIVACY_VERSION, "Условия обработки данных обновились. Обновите страницу и подтвердите согласие заново.").optional(),
  consentLanguage: z.enum(["ru", "kk", "en", "az", "uz"]).optional(),
  students: z
    .array(
      z.object({
        name: text(),
        birth: date.refine(
          (v) => v < new Date().toISOString().slice(0, 10) && v >= "1990-01-01",
          "Проверьте дату рождения",
        ),
        grade: z.number().int().min(0).max(12),
        subjects: z.array(text()).min(1, "Выберите дисциплину").max(3),
      }),
    )
    .min(1, "Добавьте ученика")
    .max(300, "Не более 300 учеников в одной заявке"),
});
export const eventSchema = z
  .object({
    title: text(),
    city: text(),
    country: text(),
    flag: z.string().max(8).default("🌍"),
    date,
    deadline: date,
    subjects: z
      .array(z.enum(["Английский язык", "Математика", "Ментальная арифметика"]))
      .min(1),
    includes: z.array(text()).min(1).max(15),
    price: z.number().int().nonnegative().nullable(),
    currency: z.enum(["KZT", "USD", "AZN", "EUR", "GBP", "AED", "TRY", "UZS"]),
    image: z
      .string()
      .max(255)
      .refine(
        isExistingEventImage,
        "Загрузите фотографию через форму или оставьте изображение пустым",
      )
      .default(""),
    telegramUrl,
    documents: z.array(z.object({
      name: z.string().trim().min(1).max(180).refine((name) => !/[\x00-\x1f\x7f/\\]/.test(name), "Проверьте название файла."),
      url: z.string().max(255).refine((url) => Boolean(existingDocument(url)), "Загрузите файл через форму мероприятия."),
    }).transform((doc) => ({ ...doc, size: existingDocument(doc.url).size })))
      .max(MAX_EVENT_DOCUMENTS, "Не более 10 файлов для одной олимпиады.")
      .refine((docs) => new Set(docs.map((doc) => doc.url)).size === docs.length, "Один и тот же файл добавлен несколько раз.")
      .optional(),
    description: text(2000),
    active: z.boolean().default(true),
  })
  .refine((v) => v.deadline <= v.date, {
    message: "Дедлайн должен быть до олимпиады",
    path: ["deadline"],
  });

export const archiveSchema = z
  .object({
    video: z
      .string()
      .max(255)
      .refine(
        isExistingEventVideo,
        "Загрузите монтаж через форму или оставьте видео пустым",
      ),
    resultsPublished: z.boolean(),
  })
  .strict();
