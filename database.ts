import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as random from "@pulumi/random";
import { rds } from "@pulumi/aws/types/enums";

export interface PrivateDatabaseArgs{

    vpcId: pulumi.Input<string>;
    cidrBlocks: pulumi.Input<string[]>;
    port: pulumi.Input<number>;
    subnetIds: pulumi.Input<pulumi.Input<string>[]>;
    availabilityZone: pulumi.Input<string>;
    engine?: pulumi.Input<string>;
    engineVersion?: pulumi.Input<string>;
    username?: pulumi.Input<string>;
    instanceClass?: pulumi.Input<string>;
    allocatedStorage?: pulumi.Input<number>;
    multiAz?: pulumi.Input<boolean>;
    backupsEnabled?: pulumi.Input<boolean>;
    

}

export class PrivateDatabase extends pulumi.ComponentResource {

    subnetGroup: aws.rds.SubnetGroup;
    securityGroup: aws.ec2.SecurityGroup;
    database: aws.rds.Instance;

    private readonly name: string

    constructor(name: string, args: PrivateDatabaseArgs, opts?: pulumi.ResourceOptions) {
        super("jaxxstorm:index:PrivateDatabase", name, {}, opts);

        this.name = name;

        this.securityGroup = new aws.ec2.SecurityGroup(`${name}-sg`, {
            vpcId: args.vpcId,
            description: "Allows access to connect to database",
            ingress: [{
                protocol: "tcp",
                fromPort: args.port,
                toPort: args.port,
                cidrBlocks: args.cidrBlocks,
            }]
        }, { parent: this })

        this.subnetGroup = new aws.rds.SubnetGroup(`${name}-subnetgroup`, {
            subnetIds: args.subnetIds
        }, { parent: this })

        const password = new random.RandomPassword(`${name}-password`, {
            length: 14,
            special: false,
        }, { parent: this })

        this.database = new aws.rds.Instance(`${name}-db`, {
            engine: args.engine || "postgres",
            engineVersion: args.engineVersion || "13.3",
            username: args.username || "root",
            password: password.result,
            instanceClass: args.instanceClass || "db.t4g.micro",
            allocatedStorage: args.allocatedStorage || 5,
            publiclyAccessible: false,
            dbSubnetGroupName: this.subnetGroup.name,
            availabilityZone: args.availabilityZone,
            multiAz: args.multiAz || false,
            skipFinalSnapshot: args.backupsEnabled ? false : true,
            backupWindow: args.backupsEnabled ? "01:00-02:00" : "",
            deleteAutomatedBackups: true,
            backupRetentionPeriod: 1,
            finalSnapshotIdentifier: `${name}-deleted`

        }, { parent: this })


        this.registerOutputs({});

    }

}