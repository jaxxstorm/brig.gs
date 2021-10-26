import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

export interface FargateWebAppEnvVarArgs{
    name: pulumi.Input<string>;
    value: pulumi.Input<string> | any;
}

export interface FargateWebAppArgs{
    vpcId: pulumi.Input<string>;
    subnetIds: pulumi.Input<pulumi.Input<string>[]>;
    environment?: FargateWebAppEnvVarArgs[];
    image: pulumi.Input<string>;
    containerName: pulumi.Input<string>;
    containerPort?: pulumi.Input<number>;
    region: pulumi.Input<string>
}

export class FargateWebApp extends pulumi.ComponentResource {

    private cluster: aws.ecs.Cluster;
    private securityGroup: aws.ec2.SecurityGroup;
    private loadBalancer: aws.lb.LoadBalancer;
    private targetGroup: aws.lb.TargetGroup;
    private httpListener: aws.lb.Listener;
    private httpsListener: aws.lb.Listener;
    private role: aws.iam.Role;
    private taskDefinition: aws.ecs.TaskDefinition;
    private svc: aws.ecs.Service;
    private logGroup: aws.cloudwatch.LogGroup;

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
            }, {
                protocol: "tcp",
                fromPort: 3000,
                toPort: 3000,
                cidrBlocks: [ "0.0.0.0/0" ]
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
            port: args.containerPort || 80,
            protocol: "HTTP",
            targetType: "ip",
            vpcId: args.vpcId,
            healthCheck: {
                path: "/api/v2/health",
                matcher: "200-299"
            }
        }, { parent: this.loadBalancer })

        this.httpListener = new aws.lb.Listener(`${name}-http`, {
            loadBalancerArn: this.loadBalancer.arn,
            port: 80,
            defaultActions: [{
                type: "redirect",
                redirect: {
                    port: "443",
                    protocol: "HTTPS",
                    statusCode: "HTTP_301"
                }
            }]
        }, { parent: this.loadBalancer })

        this.httpsListener = new aws.lb.Listener(`${name}-https`, {
            loadBalancerArn: this.loadBalancer.arn,
            protocol: "HTTPS",
            port: 443,
            defaultActions: [{
                type: "forward",
                targetGroupArn: this.targetGroup.arn,
            }],
            certificateArn: "arn:aws:acm:us-west-2:609316800003:certificate/488e44d3-afb2-4c99-a750-3576a864e290",
        }, { parent: this.loadBalancer })


        this.role = new aws.iam.Role(`${name}-role`, {
            assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "ecs-tasks.amazonaws.com" }),
        }, { parent: this });

        new aws.iam.RolePolicyAttachment(`${name}-PolicyAttachment`, {
	        role: this.role.name,
	        policyArn: 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
        }, { parent: this.role })

        this.logGroup = new aws.cloudwatch.LogGroup(`${name}-logGroup`, {
            retentionInDays: 1,
        }, { parent: this })

        this.taskDefinition = new aws.ecs.TaskDefinition(`${name}-td`, {
            family: 'fargate-task-definition',
            cpu: '512',
            memory: '1024',
            networkMode: 'awsvpc',
            requiresCompatibilities: ['FARGATE'],
            executionRoleArn: this.role.arn,
            taskRoleArn: this.role.arn,
            containerDefinitions: pulumi.output([{
		        'name': args.containerName,
		        'image': args.image,
                'environment': args.environment,
                'command': [ 'npm', 'run', 'migrate &&', 'cross-env', 'node', 'production-server/server.js' ],
		        'portMappings': [{
			        'containerPort': args.containerPort || 80,
			        'hostPort': args.containerPort || 80,
			        'protocol': 'tcp'
		        }],
                'logConfiguration': {
                    'logDriver': 'awslogs',
                    'options': {
                        "awslogs-group": this.logGroup.id,
                        "awslogs-region": args.region,
                        "awslogs-stream-prefix": "ecs"
                    }
                } 
	        }]).apply(JSON.stringify)
        }, { parent: this.cluster })

        this.svc = new aws.ecs.Service(`${name}-svc`, {
            cluster: this.cluster.arn,
            desiredCount: 3,
            launchType: "FARGATE",
            taskDefinition: this.taskDefinition.arn,
            networkConfiguration: {
                assignPublicIp: true,
                subnets: args.subnetIds,
                securityGroups: [ this.securityGroup.id ]
            },
            loadBalancers: [{
                targetGroupArn: this.targetGroup.arn,
                containerName: args.containerName,
                containerPort: args.containerPort || 80,
            }]
        }, { parent: this.cluster, dependsOn: [ this.httpListener ] })

        this.url = this.loadBalancer.dnsName

        this.registerOutputs({
            url: this.url
        });

    }

}