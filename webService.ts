import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import { Vpc } from "@pulumi/aws/ec2";
export interface FargateWebAppArgs{

    vpcId: pulumi.Input<string>;
    subnetIds: pulumi.Input<pulumi.Input<string>[]>;

}

export class FargateWebApp extends pulumi.ComponentResource {

    private cluster: aws.ecs.Cluster;
    private securityGroup: aws.ec2.SecurityGroup;
    private loadBalancer: aws.lb.LoadBalancer;
    private targetGroup: aws.lb.TargetGroup;
    private httpListener: aws.lb.Listener;
    private role: aws.iam.Role;
    private taskDefinition: aws.ecs.TaskDefinition;
    private svc: aws.ecs.Service;
    url: pulumi.Output<string>;

    private readonly name: string

    constructor(name: string, args: FargateWebAppArgs, opts?: pulumi.ResourceOptions) {
        super("jaxxstorm:index:FargateWebApp", name, {}, opts);

        this.name = name;

        this.securityGroup = new aws.ec2.SecurityGroup(`${name}-sg`, {
            vpcId: args.vpcId,
            description: "Allows access to connect to database",
            ingress: [{
                protocol: "tcp",
                fromPort: 80,
                toPort: 80,
                cidrBlocks: [ "0.0.0.0/0" ],
            }, {
                protocol: "tcp",
                fromPort: 443,
                toPort: 443,
                cidrBlocks: [ "0.0.0.0/0" ],
            }],
            egress: [{
                protocol: "-1",
                fromPort: 0,
                toPort: 0,
                cidrBlocks: [ "0.0.0.0/0" ],
            }]
        }, { parent: this })

        this.cluster = new aws.ecs.Cluster(`${name}-cluster`, {}, { parent: this })

        this.loadBalancer = new aws.lb.LoadBalancer(`${name}-lb`, {
            securityGroups: [ this.securityGroup.id ],
            subnets: args.subnetIds
        }, { parent: this })

        this.targetGroup = new aws.lb.TargetGroup(`${name}-tg`, {
            port: 80,
            protocol: "HTTP",
            targetType: "ip",
            vpcId: args.vpcId,
        }, { parent: this.loadBalancer })

        this.httpListener = new aws.lb.Listener(`${name}-http`, {
            loadBalancerArn: this.loadBalancer.arn,
            port: 80,
            defaultActions: [{
                type: "forward",
                targetGroupArn: this.targetGroup.arn
            }]
        }, { parent: this.loadBalancer })

        this.role = new aws.iam.Role(`${name}-role`, {
            assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "ecs-tasks.amazonaws.com" }),
        }, { parent: this });

        new aws.iam.RolePolicyAttachment(`${name}-PolicyAttachment`, {
	        role: this.role.name,
	        policyArn: 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
        }, { parent: this.role })

        this.taskDefinition = new aws.ecs.TaskDefinition(`${name}-td`, {
            family: 'fargate-task-definition',
            cpu: '256',
            memory: '512',
            networkMode: 'awsvpc',
            requiresCompatibilities: ['FARGATE'],
            executionRoleArn: this.role.arn,
            taskRoleArn: this.role.arn,
            containerDefinitions: JSON.stringify([{
		        'name': 'nginx',
		        'image': 'nginx',
		        'portMappings': [{
			        'containerPort': 80,
			        'hostPort': 80,
			        'protocol': 'tcp'
		        }]
	        }])
        }, { parent: this.cluster })

        this.svc = new aws.ecs.Service(`${name}-svc`, {
            cluster: this.cluster.arn,
            desiredCount: 3,
            launchType: "FARGATE",
            taskDefinition: this.taskDefinition.arn,
            networkConfiguration: {
                assignPublicIp: false,
                subnets: args.subnetIds,
                securityGroups: [ this.securityGroup.id ]
            },
            loadBalancers: [{
                targetGroupArn: this.targetGroup.arn,
                containerName: "nginx",
                containerPort: 80,
            }]
        }, { parent: this.cluster, dependsOn: [ this.httpListener ] })

        this.url = this.loadBalancer.dnsName

        this.registerOutputs({
            url: this.url
        });

    }

}