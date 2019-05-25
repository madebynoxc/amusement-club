# [Amusement Club](https://amusementclub.xyz)
## Invite
If you want to set up this card game on your server, follow [this invite link](https://discordapp.com/oauth2/authorize?client_id=340988108222758934&scope=bot&permissions=379969)
For self hosting please use a guide below.
## Setting up a runtime
You would need NodeJS 7 or higher and MongoDB 3.4 or higher.
For a correct runtime you would need to run [API server](https://github.com/yosoro-ent/amusement-api). After that make sure you create your own `./settings/general.json` which will look like this:
```json
{
    "clientid": "",
    "token": "",
    "admins": [""],
    "database": "mongodb://localhost:27017/amusement",
    "botperm": "125952",
    "botcolor": "f426d5",
    "logpath": "~/log/amusement-club/",
    "botprefix": "->",
    "lockChannel": "",
    "cardurl": "https://amusementclub.nyc3.digitaloceanspaces.com",
    "dbltoken": "",
    "dblpass": "",
    "s3accessKeyId": "",
    "s3secretAccessKey": "",

    "cardprice": [ 80, 150, 300, 600, 1000]
}
```
* `clientID` client ID for Discord bot
* `token` Discord token
* `admins` put Discord IDs of people who can run admin only commands
* `database` your MongoDB Database
* `botperm` a code for bot permissions when joining a server (optional)
* `botcolor` color for embed messages 
* `logpath` logging path
* `botprefix` prefix you would like to use (up to 3 characters)
* `lockChannel` channel to lock to a daily collection (optional)
* `cardurl` base URL to a CDN or storage server
* `dbltoken` not used anymore
* `dblpass` not used anymore
* `s3accessKeyID` Amazon S3 access key (used to search for new cards, optional if you don't use Ayano)
* `s3secretAccessKey` Amason S3 secret key
* `cardprice` array for card prices depending on rarity (used whne selling cards to bot)

Make sure you do `npm install`
Start bot by running `node index.js`

If you have your own S3 host with cards, you can use Ayano to add cards automatically. For a quick testing you can add restore a sample database dump from `amusement_testdb.tar.gz`. Unzip the archive and use `mongorestore` to restore 3 essential tables that you need.

## Ayano
Ayano is a bot integrated into Amusement Club to handle shards, restarts, errors and card adding.
### Config
Please make sure you create a file `./settings/ayano.json` which will look like this:
```json
{
    "token": "",
    "startpoint": "./index.js",
    "mainchannel": "",
    "botcommchannel": "",
    "reportchannel": "",
    "adminID": "",
    "s3accessKeyId": "",
    "s3secretAccessKey": ""
}
```
* `token` Discord bot token
* `startpoint` path to file that is used to start Amusement Club
* `mainchannel` ID of the main channel on your server (used to gree new people)
* `botcommchannel` ID of the channel that is used for Ayano commands (please note that everyone who has access to the channel can give Ayano commands)
* `reportchannel` ID of the channel to report user suspicious behaviour 
* `adminID` Discord ID of admin user
* `s3accessKeyId` key ID for requesting card list from a remote storage server
* `s3secretAccessKey` secret access key for requesting card list from a remote storage server

### Setting up storage server
Ayano supports remote storage servers of S3 type (e.g. Amazon S3, DigitalOcean Spaces). For a detailed listing you would have to specify `s3accessKeyId` and `s3secretAccessKey`. You can obtain them in the dashboard of service you are using.

On the server make sure you have `/cards/` and (optional) `/promo/`. Both folders will have subfolders that are named like collections. Those subfolders will contain `.png`, `.gif` or `.jpg` files for cards. The name of the card should be `rarity_name_with_underscare.extention`. So in the end you will have, for example `/cards/yuruyuri/2_lady_toshinou.png`

After setting up everything you can run `ayy update` in the bot commands channel you specified in the config. Ayano will populate `cards` table in your database as well as `collections` table. After that please head to your `collections` table in the database and and fill up details manually. Note that if you are using `.jpg` cards for collection, you have to make sure that `compressed` is set to `true`.
### Commands
* `ayy start` starts up all shards for bot
* `ayy stop` stops all shards
* `ayy restart` restarts all shards
* `ayy update` updates all collections from `cards/` directory on S3 storage server
* `ayy update promo` updates all collections from `promo/` directory on S3 storage server