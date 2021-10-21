import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as database from "./database";
import * as web from "./webService";

// retrieve the default VPC
const vpc = new awsx.ec2.Vpc("blink", {
    cidrBlock: "172.0.0.0/24",
    numberOfAvailabilityZones: 2,
    numberOfNatGateways: 0, // cheaper
    subnets: [
        {type: "private", tags: {Name: "blink-private", tier: "production"}},
        {type: "public", tags: {Name: "blink-public", tier: "production"}}
    ],
    tags: {
        tier: "production",
        Name: "blink"
    }
})

const db = new database.PrivateDatabase("blink", {
    vpcId: vpc.id,
    cidrBlocks: [ "172.0.0.0/24" ],
    port: 5432,
    subnetIds: vpc.privateSubnetIds,
    availabilityZone: "us-west-2b",
})

const webApp = new web.FargateWebApp("blink-web", {
    vpcId: vpc.id,
    subnetIds: vpc.publicSubnetIds
})

export const url = webApp.url


// const ami = pulumi.output(aws.ec2.getAmi({
//     filters: [
//         { name: "name", values: [ "amzn2-ami-ecs-hvm*x86_64*" ] }
//     ],
//     owners: ["amazon"],
//     mostRecent: true
// }))

// const cluster = awsx.ecs.Cluster.getDefault();

// const ecsIAMRole = new aws.iam.Role(`mainRole`, {
//     assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
//         Service: "ec2.amazonaws.com",
//     }),
// })

// const instanceProfile = new aws.iam.InstanceProfile(`mainProfile`, {
//     role: ecsIAMRole.name
// })


// new aws.iam.RolePolicyAttachment(`ecsTaskExecPolicy`, {
//     role: ecsIAMRole.name,
//     policyArn: 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
// }, { parent: ecsIAMRole })

// new aws.iam.RolePolicyAttachment(`ecsEc2RolePolicy`, {
//     role: ecsIAMRole.name,
//     policyArn: aws.iam.ManagedPolicies.AmazonEC2ContainerServiceforEC2Role
// }, { parent: ecsIAMRole })

// new aws.iam.RolePolicyAttachment(`ecsCloudwatchPolicy`, {
//     role: ecsIAMRole.name,
//     policyArn: aws.iam.ManagedPolicies.CloudWatchFullAccess
// }, { parent: ecsIAMRole })

// const asg = cluster.createAutoScalingGroup("asg", {
//     templateParameters: { minSize: 1 },
//     subnetIds: vpc.publicSubnetIds,
//     launchConfigurationArgs: { 
//         instanceType: "t2.micro",
//         associatePublicIpAddress: true,
//         iamInstanceProfile: instanceProfile.arn,
//         imageId: ami.id,
//         rootBlockDevice: {
//             volumeSize: 5,
//             volumeType: "gp2",
//         }
//     }, 
// });

// // const blink = new awsx.ecs.EC2Service("blink", {
// //     cluster,
// //     taskDefinitionArgs: {
// //         containers: {
// //             nginx: {
// //                 image: "ghcr.io/janejeon/blink:v1.1.1",
// //                 networkListener: { port: 80 },
// //             },
// //         },
// //     },
// //     desiredCount: 2,
// // });

