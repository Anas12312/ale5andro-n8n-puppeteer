import { Browser } from 'puppeteer-core';
import scrape from './scrape';

interface ScrapeTask {
    id: string;
    year: string;
    month: string;
    resolve: (value: any) => void;
    reject: (error: any) => void;
}

export class ScrapeQueue {
    private queue: ScrapeTask[] = [];
    private isProcessing = false;
    private browser: Browser;

    constructor(browser: Browser) {
        this.browser = browser;
    }

    public async enqueue(id: string, year: string, month: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.queue.push({ id, year, month, resolve, reject });
            this.processQueue();
        });
    }

    private async processQueue() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;
        const task = this.queue.shift()!;

        try {
            const result = await scrape(task.id, task.year, task.month, this.browser);
            task.resolve(result);
        } catch (error) {
            task.reject(error);
        } finally {
            this.isProcessing = false;
            this.processQueue(); // Process next task if any
        }
    }
} 