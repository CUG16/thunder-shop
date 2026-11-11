import { closePool } from '@/server/db/connection';

afterAll(closePool);
