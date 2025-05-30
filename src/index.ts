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

let browser: Browser
let scrapeQueue: ScrapeQueue

(async () => {
    browser = await puppeteer.connect({
        browserWSEndpoint: process.env.BROWSER_WS_ENDPOINT
    })
    scrapeQueue = new ScrapeQueue(browser)
})()


interface Response {
    status_code: number
    date_time: string
    result: 'PAYMENT_DATA_FOUND' | 'PAYMENT_DATA_NOT_FOUND' | 'USER_NOT_FOUND' | 'SCRAPE_FAILED',
    remarks: 'SINGLE_RECORD' | 'MULTIPLE_RECORDS' | 'SITE_UNAVAILABLE'
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
}

// GET endpoint
const handleRequest: RequestHandler = async (req, res) => {
    const { local_id_number, year, month, local_id_type } = req.query

    if (!local_id_number || !year || !month || !local_id_type) {
        res.status(400).json({ error: 'Missing required parameters' })
        return
    }

    if (local_id_type !== 'NATIONAL_IDENTITY_CARD' && local_id_type !== 'PASSPORT') {
        res.status(400).json({ error: 'Invalid type' })
        return
    }

    try {
        const result = await scrapeQueue.enqueue(local_id_number as string, year as string, month as string, local_id_type as 'NATIONAL_IDENTITY_CARD' | 'PASSPORT')
        res.status(200).json({
            status_code: 200,
            date_time: new Date().toISOString(),
            result: result.data.length > 0 ? 'PAYMENT_DATA_FOUND' : 'PAYMENT_DATA_NOT_FOUND',
            remarks: result.result === 'NO_DATA_FOUND' ? 'SITE_UNAVAILABLE' : result.data.length > 0 ? 'MULTIPLE_RECORDS' : 'SINGLE_RECORD',
            request_data: {
                local_id_type: local_id_type,
                local_id_number: local_id_number,
                year: year,
                month: month
            },
            response_data: result.data
        })
        return
    } catch (error) {
        console.error('Error in handleRequest:', error)
        res.status(500).json({ error: 'An error occurred' })
        return
    }
}

app.get('/', handleRequest)

// Start server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})