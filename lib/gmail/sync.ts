import "server-only";
import { gmailDatabase } from './database';
import { gmailConfig } from './security';
import { ingestGmail } from './ingestion';
export function runGmailSync({ verification = false, retryFailed = false } = {}) { return ingestGmail(gmailConfig(), gmailDatabase, verification, fetch, retryFailed); }
