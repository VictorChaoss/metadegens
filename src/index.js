import 'dotenv/config';
import { startServer } from './server/index.js';
import logger from './utils/logger.js';

logger.info('===== Metadegens Arena v2 Starting =====');
startServer();
