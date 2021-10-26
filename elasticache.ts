import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

export interface PrivateManagedRedisArgs {
    vpcId: pulumi.Input<string>;
    subnetIds: pulumi.Input<pulumi.Input<string>[]>;
    cidrBlocks: pulumi.Input<string[]>;
    instanceClass?: pulumi.Input<string>;
    numberOfNodes?: pulumi.Input<number>;

}

export class PrivateManagedRedis extends pulumi.ComponentResource {

    private securityGroup: aws.ec2.SecurityGroup;
    private subnets: aws.elasticache.SubnetGroup;
    cluster: aws.elasticache.Cluster;

    private readonly name: string

    constructor(name: string, args: PrivateManagedRedisArgs, opts?: pulumi.ResourceOptions) {
        super("jaxxstorm:index:PrivateElasticache", name, {}, opts);

        this.name = name;

        this.securityGroup = new aws.ec2.SecurityGroup(`${name}-sg`, {
            vpcId: args.vpcId,
            description: "Allows access to connect to database",
            ingress: [{
                protocol: "tcp",
                fromPort: 6379,
                toPort: 6379,
                cidrBlocks: args.cidrBlocks,
            }],
            egress: [{
                protocol: "-1",
                fromPort: 0,
                toPort: 0,
                cidrBlocks: [ "0.0.0.0/0" ],
            }]
        }, { parent: this })

        this.subnets = new aws.elasticache.SubnetGroup(`${name}-securitygroup`, {
            subnetIds: args.subnetIds,
        }, { parent: this })

        this.cluster = new aws.elasticache.Cluster(`${name}-elastiCache`, {
            engine: "redis",
            nodeType: args.instanceClass || "cache.t2.micro",
            numCacheNodes: args.numberOfNodes || 1,
            subnetGroupName: this.subnets.name,
            securityGroupIds: [ this.securityGroup.id ], 
        }, { parent: this });


        this.registerOutputs({});

    }

}