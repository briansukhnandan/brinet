import * as sqlite3 from "sqlite3";
import { Nullable } from "src/Constants";

const DATABASE_FILE_PATH = "./src/db/brinet.db";
export type Dbc = sqlite3.Database;

export const withDbc = async <T>(
  fn: (dbc: Dbc) => Promise<T>
): Promise<Nullable<T>> => {
  let wasDbInitalized = true;
  const db = new sqlite3.Database(
    DATABASE_FILE_PATH,
    (err) => {
      if (err) {
        console.log(err);
        wasDbInitalized = false;
      }
    }
  );

  if (!wasDbInitalized) {
    throw new Error("Could not initialize DB!");
  }

  /** 
   * There seems to be an issue with sqlite3 where
   * db.close() is being called before db.serialize(),
   * and thus immediately terminating the connection.
   * Doesn't seem to be an issue for now.
   */
  let returnValue = null;
  db.serialize(async() => {
    returnValue = await fn(db);
  });
  return returnValue;
}
