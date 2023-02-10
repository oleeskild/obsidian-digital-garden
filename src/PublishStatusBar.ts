export class PublishStatusBar {
    statusBarItem: HTMLElement;
    counter: number;
    numberOfNotesToPublish: number;

    status: HTMLElement;
    constructor(statusBarItem: HTMLElement, numberOfNotesToPublish: number) {
        this.statusBarItem = statusBarItem;
        this.counter = 0;
        this.numberOfNotesToPublish = numberOfNotesToPublish;


        this.statusBarItem.createEl("span", { text: "Digital Garden: " });
        this.status = this.statusBarItem.createEl("span", { text: `${this.numberOfNotesToPublish} files marked for publishing` });
    }

    increment() {

        this.status.innerText = `⌛Publishing files: ${++this.counter}/${this.numberOfNotesToPublish}`;
    }

    finish(displayDurationMillisec: number) {
        this.status.innerText = `✅ Published files: ${this.counter}/${this.numberOfNotesToPublish}`;
        setTimeout(() => {
            this.statusBarItem.remove();
        }, displayDurationMillisec);

    }

    error(){
        this.statusBarItem.remove();
    }
}