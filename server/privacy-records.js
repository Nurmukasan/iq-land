// No HTTP endpoint: an operator must first verify the requester's authority.
export function registrationData(db, id) {
  const registration = db.prepare("SELECT * FROM registrations WHERE id=?").get(id);
  if (!registration) throw Error("Заявка не найдена");
  return {
    registration: { ...registration, teachers: JSON.parse(registration.teachers) },
    students: db.prepare("SELECT * FROM students WHERE registration_id=? ORDER BY id").all(id).map((student) => ({
      ...student,
      entries: db.prepare("SELECT subject,score FROM entries WHERE student_id=? ORDER BY subject").all(student.id),
    })),
    consent: db.prepare("SELECT * FROM registration_consents WHERE registration_id=?").get(id) || null,
  };
}

export function erasureSummary(db, id) {
  const registration = db.prepare("SELECT event_id FROM registrations WHERE id=?").get(id);
  if (!registration) throw Error("Заявка не найдена");
  return {
    registrationId: id,
    eventId: registration.event_id,
    students: db.prepare("SELECT COUNT(*) AS n FROM students WHERE registration_id=?").get(id).n,
    // Award snapshots contain names and dates of birth. Removing only rows in
    // students would leave this copy behind and stale medals for other pupils.
    awardSnapshotWillBeRemoved: Boolean(db.prepare("SELECT 1 FROM award_runs WHERE event_id=?").get(registration.event_id)),
  };
}

export function eraseRegistration(db, id) {
  db.exec("PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; BEGIN IMMEDIATE");
  try {
    const summary = erasureSummary(db, id);
    db.prepare("DELETE FROM award_runs WHERE event_id=?").run(summary.eventId);
    db.prepare("DELETE FROM registrations WHERE id=?").run(id);
    db.exec("COMMIT");
    return summary;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function retentionReview(db, before) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before) || !Number.isFinite(Date.parse(before)) || new Date(before).toISOString().slice(0, 10) !== before)
    throw Error("Укажите существующую дату в формате YYYY-MM-DD");
  // This is a review queue, not an automatic decision about legal retention.
  return db.prepare(`SELECT r.id,r.event_id,r.created,e.date AS event_date,
    (SELECT COUNT(*) FROM students s WHERE s.registration_id=r.id) AS students
    FROM registrations r JOIN events e ON e.id=r.event_id
    WHERE substr(r.created,1,10)<? AND e.date<? ORDER BY r.created,r.id`).all(before, before);
}
