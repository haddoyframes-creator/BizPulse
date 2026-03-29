import Database from "better-sqlite3";
const db = new Database("bizpulse.db");
console.log(db.prepare("SELECT * FROM customers").all());
