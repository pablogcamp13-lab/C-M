// This legacy script deleted evaluations, feedbacks and accounts during roster import.
// Fail before opening the database, reading credentials or calling Google APIs.
throw new Error('Importación legacy deshabilitada porque reemplazaba el historial. Usa Dotación > Importar en la plataforma para conservar los registros existentes.');

export {};
