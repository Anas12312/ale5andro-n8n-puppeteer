import express, { RequestHandler } from 'express'
import puppeteer, { Browser } from "puppeteer-core";
import cors from 'cors'
import dotenv from 'dotenv'
dotenv.config()

import { ScrapeQueue } from './queue'

// Create Express app
const app = express()

// Middleware
app.use(cors())
app.use(express.json())

app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

let browser: Browser
let scrapeQueue: ScrapeQueue

async function init() {
    browser = await puppeteer.connect({
        browserWSEndpoint: process.env.BROWSER_WS_ENDPOINT
    })
    scrapeQueue = new ScrapeQueue(browser)
}

init()

interface Response {
    scraped_page_status_code: number
    date_time: string
    result: 'PAYMENT_DATA_FOUND' | 'PAYMENT_DATA_NOT_FOUND' | 'USER_NOT_FOUND' | 'SCRAPE_FAILED',
    remarks: 'SINGLE_RECORD' | 'MULTIPLE_RECORDS' | 'SITE_UNAVAILABLE' | 'NO_DATA_FOUND'
    request_data: {
        local_id_type: 'NATIONAL_IDENTITY_CARD' | 'PASSPORT'
        local_id_number: string
        year: string
        month: string
    }
    response_data: {
        form_id: string
        form_type: string
        amount_original: string
        status: string
        period: string
    }
    time_taken: number,
    error_message?: string
    url: string
}


async function scrapeStart(local_id_number: string, year: string, month: string, local_id_type: 'NATIONAL_IDENTITY_CARD' | 'PASSPORT') {
    const result = await scrapeQueue.enqueue(local_id_number as string, year as string, month as string, local_id_type as 'NATIONAL_IDENTITY_CARD' | 'PASSPORT')

    if (result.error_message?.startsWith('Protocol error: Connection closed.')) {
        await init()
        return scrapeStart(local_id_number, year, month, local_id_type)
    }

    return result
}

// GET endpoint
const handleRequest: RequestHandler = async (req, res) => {
    const { local_id_number, year, month, local_id_type } = req.query

    const headers = req.headers

    const apiKey = headers['x-api-key'] as string
    const apiSecret = headers['x-api-secret'] as string
    const sourceSystem = headers['x-source-system'] as string
    const origin = headers['x-origin'] as string
    const timestamp = headers['x-timestamp'] as string
    const signature = headers['x-signature'] as string

    if (
        apiKey !== process.env.API_KEY ||
        apiSecret !== process.env.API_SECRET ||
        sourceSystem !== process.env.SOURCE_SYSTEM ||
        origin !== process.env.ORIGIN_IP ||
        timestamp !== process.env.TIMESTAMP ||
        signature !== process.env.SIGNATURE
    ) {
        res.status(401).json({ error: 'Unauthorized' })
        return
    }

    if (!local_id_number || !year || !month || !local_id_type) {
        res.status(400).json({ error: 'Missing required parameters' })
        return
    }

    if (local_id_type !== 'NATIONAL_IDENTITY_CARD' && local_id_type !== 'PASSPORT') {
        res.status(400).json({ error: 'Invalid type' })
        return
    }

    try {
        const start = performance.now()
        const result = await scrapeStart(local_id_number as string, year as string, month as string, local_id_type as 'NATIONAL_IDENTITY_CARD' | 'PASSPORT')
        const end = performance.now()

        res.status(200).json({
            url: 'https://servicio.nuevosoi.com.co/soi/consultarplanillas.do',
            scraped_page_status_code: (result.result === 'PAYMENT_DATA_FOUND' || result.result === 'PAYMENT_DATA_NOT_FOUND') ? 200 : 400,
            date_time: new Date().toISOString(),
            time_taken: end - start,
            result: result.result,
            remarks: result.remarks,
            request_data: {
                local_id_type: local_id_type,
                local_id_number: local_id_number,
                year: year,
                month: month
            },
            response_data: result.data,
            error_message: result.error_message
        } as Response)

        return

    } catch (error) {
        console.error('Error in handleRequest:', error)
        res.status(500).json({
            url: 'https://servicio.nuevosoi.com.co/soi/consultarplanillas.do',
            scraped_page_status_code: 400,
            date_time: new Date().toISOString(),
            request_data: {
                local_id_type: local_id_type,
                local_id_number: local_id_number,
                year: year,
                month: month
            },
            response_data: [],
            error_message: error
        })
        return
    }
}

app.get('/', handleRequest)

// Start server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})