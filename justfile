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
