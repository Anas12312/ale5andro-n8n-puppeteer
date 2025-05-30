import puppeteer, { Browser, Page } from "puppeteer-core"


interface Data {
    form_id: string
    form_type: string
    amount_original: string
    status: string
    period: string
}
const BROWSER_WS_ENDPOINT = process.env.BROWSER_WS_ENDPOINT

export default async function scrape(id: string, year: string, month: string, type: 'NATIONAL_IDENTITY_CARD' | 'PASSPORT', browser: Browser): Promise<{
    data: Data[],
    result: string
}> {

    if (!browser) {
        throw new Error('Browser is still connecting...')
    }

    try {
        console.log('Starting scrape');
        const start = performance.now()

        const page: Page = await browser.newPage();
        await page.goto("https://servicio.nuevosoi.com.co/soi/consultarplanillas.do", { waitUntil: "networkidle0" });

        console.log('Navigated to page');

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

        console.log('Clicked search button');

        try {
            // Table

            await page.waitForNetworkIdle()

            const table = await page.waitForSelector('table#tablaPlanillaAsistida', { timeout: 10_000 })

            const tableRows = await table?.evaluate(el => {
                const rows = el.querySelectorAll('tr');

                return Array.from(rows).map(row => {
                    const cells = row.querySelectorAll('td');
                    const arr = Array.from(cells).map(cell => cell.textContent);
                    return {
                        form_id: arr[0],
                        form_type: arr[1],
                        amount_original: arr[2],
                        status: arr[3],
                        period: arr[4]?.trim(),
                    }
                });
            })

            console.log('Scraped table');
            const end = performance.now()
            console.log(`Scraped table in ${end - start} milliseconds`)

            tableRows?.shift()

            return {
                data: tableRows as Data[],
                result: `Scraped table in ${end - start} milliseconds`
            }
        } catch (error) {
            console.error('No data found')
            return {
                data: [],
                result: 'NO_DATA_FOUND'
            }
        }

    } catch (error) {
        console.error('Error in scrape:', error)
        return {
            data: [],
            result: 'SCRAPE_FAILED'
        }
    }
}
