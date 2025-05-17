# Quartz Syncer

Quartz Syncer is an [Obsidian](https://obsidian.md/) plugin for managing and publishing notes to [Quartz](https://quartz.jzhao.xyz/), the fast, batteries-included static-site generator that transforms Markdown content into fully functional websites.

## Installation

Install the plugin by downloading it from the Obsidian Community plugins browser in Obsidian.

Alternatively, install the plugin by downloading it from the [Release Tab](https://github.com/saberzero1/quartz-syncer/releases), or through the [Obsidian42 Brat plugin](https://github.com/TfTHacker/obsidian42-brat).

## Setup

> [!TIP] Quartz Syncer documentation
>
> For the most up-to-date information on Quartz Syncer, please refer to the [official documentation](https://saberzero1.github.io/quartz-syncer-docs/).

New to Quartz Syncer? please follow the [setup guide](https://saberzero1.github.io/quartz-syncer-docs/Setup-Guide) to get started.

## Usage

Unsure on how to use Quartz Syncer, or just curious about its usage? Check the [usage guide](https://saberzero1.github.io/quartz-syncer-docs/Usage-Guide).

## Advanced usage

For more advanced usages of Quartz Syncer, check the [[Guides/index|guides section]].

## Troubleshooting

> [!INFO] Quartz-related questions
>
> For issue or questions related to Quartz, not Quartz Syncer, please consult the [Quartz documentation](https://quartz.jzhao.xyz/) or reach out through the communication channels provided there.

If you need help with Quartz Syncer, or if you have a question, please first check the [troubleshooting section](https://saberzero1.github.io/quartz-syncer-docs/Troubleshooting/). If your question or issue is not listed, feel free to [reach out for help](https://saberzero1.github.io/quartz-syncer-docs/Troubleshooting/#i-have-a-different-issue-not-listed-here).

## Disclosures

As per the [Obsidian developer policies](https://docs.obsidian.md/Developer+policies#Disclosures):

- **Account requirements**: Quartz Syncer needs to access your Quartz repository on GitHub in order to be able to publish your notes. A GitHub account is therefore required, though also implictly expected, if you're using Quartz.
- **Network use**: Quartz Syncer accesses the network to manage and publish your notes to your Quartz repository on GitHub. Quartz Syncer uses the [GitHub REST API](https://docs.github.com/en/rest) to access your Quartz repository over the network.
- **Accessing files outside of Obsidian vaults**: As Quartz Syncer only manages explictly marked and user-selected notes in your Quartz repository `content` folder. Quartz Syncer also fetches the current contents of this folder to compare changes against your notes. Quartz Syncer doesn't write any notes to your Obsidian vault, Quartz Syncer only writes to your Quartz repository (one-way only: from Obsidian vault to Quartz repository.) When [authentication is properly set up with a fine-grained access token](https://saberzero1.github.io/quartz-syncer-docs/Guides/Generating-an-access-token#generating-a-fine-grained-access-token), Quartz Syncer is only able to modify file contents on your Quartz repository. Quartz Syncer cannot access other repositories on the same GitHub account or organization, nor modify any other settings in your Quartz Repository.

## Acknowledgements

Quartz Syncer would not have been build without the following:

- [Obsidian Digital Garden](https://dg-docs.ole.dev/), on top of which most of this plugin was initially built.
- [Quartz](https://quartz.jzhao.xyz/), for the amazing and welcoming community. Come say hi in the Discord server sometimes.
- [Dataview](https://blacksmithgu.github.io/obsidian-dataview/), for their great API integration, allowing me to properly integrate it in Quartz.
- [Obsidian Publish](https://obsidian.md/publish), for inspiring me to create a similar solution for Quartz.
- The entire Obsidian community, for all your weird and amazing creations. Keep it up.
