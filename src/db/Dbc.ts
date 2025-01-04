import { DatabaseSync } from "node:sqlite";

const DATABASE_FILE_PATH = "brinet.db";
const database = new DatabaseSync(DATABASE_FILE_PATH);

export const withDbc = <T>(
  fn: (dbc: DatabaseSync) => T
): T => {
  database.open();
  const returnValue = fn(database);
  database.close();
  return returnValue;
}
