import puppeteer, { Browser, Page } from "puppeteer-core"


interface Data {
    form_id: string
    form_type: string
    amount_original: string
    status: string
    period: string
}
const BROWSER_WS_ENDPOINT = process.env.BROWSER_WS_ENDPOINT

interface PerformanceResult {
    action: string
    time: number
}

export default async function scrape(id: string, year: string, month: string, type: 'NATIONAL_IDENTITY_CARD' | 'PASSPORT', browser: Browser): Promise<{
    data: Data[],
    result: 'PAYMENT_DATA_FOUND' | 'PAYMENT_DATA_NOT_FOUND' | 'USER_NOT_FOUND' | 'SCRAPE_FAILED',
    remarks: 'SINGLE_RECORD' | 'MULTIPLE_RECORDS' | 'SITE_UNAVAILABLE' | 'NO_DATA_FOUND',
    error_message?: string,
    performanceResults: PerformanceResult[]
}> {

    const performanceResults: PerformanceResult[] = []

    if (!browser) {
        throw new Error('Browser is still connecting...')
    }

    try {
        // Start scraping
        console.log('Starting scrape');
        const startConnect = performance.now()

        const page: Page = await browser.newPage();

        const endConnect = performance.now()

        performanceResults.push({
            action: 'CONNECT_TO_REMOTE_BROWSER',
            time: endConnect - startConnect
        })

        const startNavigate = performance.now()

        await page.goto("https://servicio.nuevosoi.com.co/soi/consultarplanillas.do", { waitUntil: "networkidle0" });

        const endNavigate = performance.now()

        performanceResults.push({
            action: 'NAVIGATE_TO_PAGE',
            time: endNavigate - startNavigate
        })


        const startInputFilling = performance.now()

        // Select Document Type
        const firstSelect = await page.waitForSelector('select#tipoDocumento');

        if (type === 'NATIONAL_IDENTITY_CARD') {
            await firstSelect?.select('1');
        } else if (type === 'PASSPORT') {
            await firstSelect?.select('5');
        }

        const idInput = await page.waitForSelector('input#numeroDocumento');

        await idInput?.type(id);

        // Search 1
        const searchButton = await page.waitForSelector('a#planillasDisponiblesPago')
        await searchButton?.click();

        // Select Year
        const secondSelect = await page.waitForSelector('select#periodoLiqOtrosSubsAnno')
        await secondSelect?.select(year);

        // Select Month
        const thirdSelect = await page.waitForSelector('select#periodoLiqOtrosSubsMess')
        await thirdSelect?.select(month);

        // Search 2
        const searchButton2 = await page.waitForSelector('button#btnGuardar')
        await searchButton2?.click();

        const endInputFilling = performance.now()

        performanceResults.push({
            action: 'INPUT_FILLING',
            time: endInputFilling - startInputFilling
        })

        try {
            // Table

            const startSearchTable = performance.now()

            await page.waitForNetworkIdle()

            const endSearchTable = performance.now()

            performanceResults.push({
                action: 'SEARCH_TABLE',
                time: endSearchTable - startSearchTable
            })

            const startScrapeTable = performance.now()

            const table = await page.waitForSelector('table#tablaPlanillaAsistida', { timeout: 10_000 })

            const tableRows = await table?.evaluate(el => {
                const rows = el.querySelectorAll('tr');

                return Array.from(rows).map(row => {
                    const cells = row.querySelectorAll('td');
                    const arr = Array.from(cells).map(cell => cell.textContent);

                    const numericAmount = Number((arr[2] as string)?.replaceAll('.', '').replace('$', '') || '0')

                    return {
                        form_id: arr[0],
                        form_type: arr[1],
                        amount_original: arr[2],
                        amount: numericAmount * 100,
                        status: arr[3],
                        period: arr[4]?.trim(),
                    }
                });
            })

            console.log('Scraped table');
            const endScrapeTable = performance.now()
            console.log(`Scraped table in ${endScrapeTable - startScrapeTable} milliseconds`)

            performanceResults.push({
                action: 'SCRAPED_PAYMENT_DATA',
                time: endScrapeTable - startScrapeTable
            })

            tableRows?.shift()

            let result: 'PAYMENT_DATA_FOUND' | 'PAYMENT_DATA_NOT_FOUND' | 'USER_NOT_FOUND' | 'SCRAPE_FAILED'
            let remarks: 'SINGLE_RECORD' | 'MULTIPLE_RECORDS' | 'SITE_UNAVAILABLE' | 'NO_DATA_FOUND'
            if (tableRows?.length === 0) {
                result = 'PAYMENT_DATA_NOT_FOUND'
                remarks = 'NO_DATA_FOUND'
            } else if (tableRows?.length === 1) {
                result = 'PAYMENT_DATA_FOUND'
                remarks = 'SINGLE_RECORD'
            } else {
                result = 'PAYMENT_DATA_FOUND'
                remarks = 'MULTIPLE_RECORDS'
            }

            return {
                data: tableRows as Data[],
                result,
                remarks,
                performanceResults: [
                    ...performanceResults,
                    {
                        action: 'TOTAL',
                        time: performanceResults.reduce((acc, curr) => acc + curr.time, 0)
                    }
                ]
            }
        } catch (error) {
            console.error('No data found')
            return {
                data: [],
                result: 'PAYMENT_DATA_NOT_FOUND',
                remarks: 'NO_DATA_FOUND',
                performanceResults
            }
        }

    } catch (error) {
        console.error('Error in scrape:', error)
        return {
            data: [],
            result: 'SCRAPE_FAILED',
            remarks: 'SITE_UNAVAILABLE',
            error_message: (error as Error).message, // Protocl error: Connection closed.
            performanceResults
        }
    }
}
