import * as sqlite3 from "sqlite3";

const DATABASE_FILE_PATH = "brinet.db";
export type Dbc = sqlite3.Database;

export const withDbc = async <T>(
  fn: (dbc: Dbc) => Promise<T>
): Promise<T> => {
  const database = new sqlite3.Database(DATABASE_FILE_PATH);
  const returnValue = await fn(database);
  database.close();
  return returnValue;
}
