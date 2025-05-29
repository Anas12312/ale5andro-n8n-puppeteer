import express, { Request, Response, RequestHandler } from 'express'
import puppeteer, { Browser, Page } from "puppeteer-core";
import cors from 'cors'
import dotenv from 'dotenv'
dotenv.config()

import scrape from './scrape'

// Create Express app
const app = express()


// Middleware
app.use(cors())
app.use(express.json())

let browser: Browser

(async () => {
    browser = await puppeteer.connect({
        browserWSEndpoint: process.env.BROWSER_WS_ENDPOINT
    })
})()


// GET endpoint
const handleRequest: RequestHandler = async (req, res) => {
    const { id, year, month } = req.query

    if (!id || !year || !month) {
        res.status(400).json({ error: 'Missing required parameters' })
        return
    }

    try {
        const result = await scrape(id as string, year as string, month as string, browser)
        res.json(result)
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