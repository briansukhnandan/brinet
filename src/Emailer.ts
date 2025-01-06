import fs from "fs";
import Client from "@sendgrid/mail";
import {
  baseFileName,
  fetchSecret,
  getCurrentDate,
  getFileExtension,
  getMimeTypeFromFileExt
} from "./Util";
import { Logger } from "./Logger";
import { Context } from "./Constants";

/** From email must be configured on SendGrid. */
const FROM_EMAIL = "briansukhnandan@gmail.com";
const SEND_EMAIL = "sukhnandanbrian@gmail.com";

const systemLogger = new Logger(Context.SYSTEM);

export class Emailer {
  constructor() {
    Client.setApiKey(
      fetchSecret("SENDGRID_API_KEY")
    );
  }

  public sendEmail(
    subject: string, 
    text: string, 
    /** Path to attachments */
    attachments?: string[]
  ) {
    const msg: SendGridMessage = {
      to: SEND_EMAIL,
      from: FROM_EMAIL,
      subject,
      text,
    };

    if (attachments?.length) {
      const attachmentDatas = attachments.map(path => ({
        path,
        baseFileName: baseFileName(path),
        mimetype: getMimeTypeFromFileExt(getFileExtension(path)),
        data: fs.readFileSync(path).toString("base64"),
      }));

      msg.attachments = attachmentDatas.map(
        (data) => ({
          content: data.data,
          filename: data.baseFileName,
          type: data.mimetype,
          disposition: "attachment"
        })
      );
    }

    Client.send(msg)
      .then((res) => {
        if ([200, 202].includes(res[0].statusCode)) {
          systemLogger.log(
            `Successfully sent email for date ${getCurrentDate()}!`
          );
        }
      })
      .catch((error) => {
        console.error(error);
      });
  }
}

type SendGridMessage = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: {
    content: string;
    filename: string;
    type: string;
    disposition: "attachment"
  }[];
}
