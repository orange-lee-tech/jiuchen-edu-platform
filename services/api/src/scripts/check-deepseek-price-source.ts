import mysql from 'mysql2/promise'
import 'dotenv/config'
import { checkDeepseekPriceSource } from '../services/assessment-ai-cost.js'

const databaseUrl=process.env.DATABASE_URL
if(!databaseUrl)throw new Error('DATABASE_URL is required')
const pool=mysql.createPool(databaseUrl)
try{
  const status=await checkDeepseekPriceSource(pool)
  console.info(status.status)
}finally{await pool.end()}
