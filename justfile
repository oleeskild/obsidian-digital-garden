default:
	just --list

dev:
	npm run dev
	mkdir -p ./docs/.obsidian/plugins/quartz-syncer
	cp main.js ./docs/.obsidian/plugins/quartz-syncer
	cp manifest.json ./docs/.obsidian/plugins/quartz-syncer
	cp styles.css ./docs/.obsidian/plugins/quartz-syncer

prod:
	npm run build
	mkdir -p ./docs/.obsidian/plugins/quartz-syncer
	cp main.js ./docs/.obsidian/plugins/quartz-syncer
	cp manifest.json ./docs/.obsidian/plugins/quartz-syncer
	cp styles.css ./docs/.obsidian/plugins/quartz-syncer

lint:
	npm run format

test:
	npm run test

check:
	npm run lint
	npm run test
	npm run check-formatting
	npm run typecheck
