import puppeteer, { Page } from "puppeteer-core"


interface Data {
    payroll_number: string
    payroll_type: string
    payroll_value: string
    state: string
    settled_period: string
}

export default async function scrape(id: string, year: string, month: string): Promise<Data[]> {

    try {
        const BROWSER_WS_ENDPOINT = process.env.BROWSER_WS_ENDPOINT

        const browser = await puppeteer.connect({
            browserWSEndpoint: BROWSER_WS_ENDPOINT
        });


        const page: Page = await browser.newPage();
        await page.goto("https://servicio.nuevosoi.com.co/soi/consultarplanillas.do", { waitUntil: "networkidle0" });

        const firstSelect = await page.waitForSelector('select#tipoDocumento');

        await firstSelect?.select('1');

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
                        payroll_number: arr[0],
                        payroll_type: arr[1],
                        payroll_value: arr[2],
                        state: arr[3],
                        settled_period: arr[4]?.trim(),
                    }
                });
            })

            tableRows?.shift()

            return tableRows as Data[] || []
        } catch (error) {
            console.error('No data found')
            return []
        }

    } catch (error) {
        console.error('Error in scrape:', error)
        return []
    }
}
