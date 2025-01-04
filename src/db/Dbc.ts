import { DatabaseSync } from "node:sqlite";

const DATABASE_FILE_PATH = "brinet.db";
const database = new DatabaseSync(DATABASE_FILE_PATH);

export const withDbc = async <T>(
  fn: (dbc: DatabaseSync) => Promise<T>
): Promise<T> => {
  database.open();
  const returnValue = await fn(database);
  database.close();
  return returnValue;
}
