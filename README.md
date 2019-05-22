# Amusement Club
[logo]: https://github.com/NoxCaos/amusement-club/blob/master/invite.png

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