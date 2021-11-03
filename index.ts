import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as database from "./database";
import * as web from "./webService";
import * as redis from "./elasticache";

// retrieve the default VPC
const vpc = new awsx.ec2.Vpc("kutt", {
    cidrBlock: "172.0.0.0/24",
    numberOfAvailabilityZones: 2,
    numberOfNatGateways: 0, // cheaper
    subnets: [
        {type: "private", tags: {Name: "kutt-private", tier: "production"}},
        {type: "public", tags: {Name: "kutt-public", tier: "production"}}
    ],
    tags: {
        tier: "production",
        Name: "kutt"
    }
})

const db = new database.PrivateDatabase("kutt", {
    vpcId: vpc.id,
    cidrBlocks: [ "172.0.0.0/24" ],
    port: 5432,
    subnetIds: vpc.publicSubnetIds,
    availabilityZone: "us-west-2b",
})

const cache = new redis.PrivateManagedRedis("kutt", {
    vpcId: vpc.id,
    cidrBlocks: [ "172.0.0.0/24" ],
    subnetIds: vpc.publicSubnetIds,
})


const webApp = new web.FargateWebApp("kutt-web", {
    image: "kutt/kutt:v2.7.3",
    containerName: "kutt",
    containerPort: 3000,
    vpcId: vpc.id,
    subnetIds: vpc.publicSubnetIds,
    environment: [{
        name: "SITE_NAME", value: "brig.gs",
    }, {
        name: "DB_USER", value: db.database.username,
    }, {
        name: "DB_HOST", value: db.database.address,
    }, {
        name: "DB_NAME", value: "postgres",
    }, {
        name: "DB_PASSWORD", value: db.database.password,
    }, {
        name: "REDIS_HOST", value: cache.cluster.cacheNodes[0].address
    }, {
        name: "DEFAULT_DOMAIN", value: "l.brig.gs"
    }, {
        name: "ADMIN_EMAILS", value: "lee@leebriggs.co.uk",
    }, {
        name: "JWT_SECRET", value: "foo",
    }, {
        name: "MAIL_HOST", value: "email-smtp.us-west-2.amazonaws.com",
    }, {
        name: "MAIL_PORT", value: "465",
    }, {
        name: "MAIL_USER", value: "",
    }, {
        name: "MAIL_PASSWORD", value: "",
    }, {
        name: "MAIL_FROM", value: "mail@l.brig.gs"
    }, {
        name: "MAIL_SECURE", value: "true",
    }, {
        name: "NODE_END", value: "development"
    }],
    region: "us-west-2",
}, { dependsOn: [ db, cache ] })

export const url = webApp.url
