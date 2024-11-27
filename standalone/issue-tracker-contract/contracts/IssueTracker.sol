// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/utils/Strings.sol";

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract IssueTracker {
    uint256 public projectCounter;
    address payable public owner;

    constructor() {
        projectCounter = 0;
        owner = payable(msg.sender);
    }

    // Enum to represent the current status of an issue
    enum IssueStatus {
        REPORTED,
        VERIFIED,
        FIXED,
        CLOSED
    }

    // Struct to represent a project and its details
    struct Project {
        uint256 id; // Unique identifier for the project
        string name; // Name of the project
        uint256 issueCount; // Number of issues associated with the project
        address organizationAddress; // Address of the organization owning the project
        Stack[] techStacks; // Array of technology stacks used in the project
    }

    // Struct to represent a technology stack and its version
    struct Stack {
        string name; // Name of the stack
        uint256 version; // Version number of the stack
    }

    // Struct to represent an individual issue
    struct Issue {
        string id; // Unique issue identifier
        uint256 projectId; // ID of the project this issue belongs to
        IssueStatus status; // Current status of the issue
    }

    // Struct to represent an organization and its details
    struct Organization {
        string name; // Name of the organization
        string description; // Description of the organization
        string contact; // Contact details of the organization
    }

    // Mappings
    mapping(uint256 => Project) public projects; // Maps project ID to project details
    mapping(string => Issue) public issues; // Maps issue ID to issue details
    mapping(address => string[]) public organizationIssues; // Maps organization address to its list of issue IDs
    mapping(address => Organization) public organizations; // Maps an address to its organization details

    // Events
    event ProjectCreated(uint256 projectId, string name, address organizationAddress);
    event StackAdded(uint256 projectId, string name, uint256 version);
    event IssuesAdded(string[] issueIds, uint256 projectId);
    event IssueStatusChanged(string[] issueIds, IssueStatus status);
    event OrganizationRegistered(
        address organizationAddress,
        string name,
        string description,
        string contact
    );

    // Function to register a new organization
    function registerOrganization(
        string memory _name,
        string memory _description,
        string memory _contact
    ) public {
        require(bytes(_name).length > 0, "Organization name cannot be empty");
        require(
            bytes(organizations[msg.sender].name).length == 0,
            "Organization already registered"
        );

        Organization memory newOrganization = Organization({
            name: _name,
            description: _description,
            contact: _contact
        });

        organizations[msg.sender] = newOrganization;
        emit OrganizationRegistered(msg.sender, _name, _description, _contact);
    }

    // Function to add a new project
    function addProject(
        string memory _name,
        string[] memory _stacks,
        uint256[] memory _versions
    ) public {
        require(bytes(_name).length > 0, "Project name cannot be empty");
        require(
            _stacks.length == _versions.length,
            "Stacks and versions length mismatch"
        );
        require(
            bytes(organizations[msg.sender].name).length > 0,
            "Organization not registered"
        );

        projectCounter++;
        uint256 projectId = projectCounter;

        Project storage newProject = projects[projectId];
        newProject.id = projectId;
        newProject.name = _name;
        newProject.issueCount = 0;
        newProject.organizationAddress = msg.sender;

        emit ProjectCreated(projectId, _name, msg.sender);

        for (uint256 i = 0; i < _stacks.length; i++) {
            Stack memory stack = Stack({
                name: _stacks[i],
                version: _versions[i]
            });

            newProject.techStacks.push(stack);

            emit StackAdded(projectId, _stacks[i], _versions[i]);
        }
    }

    // Function to add new issues to a project
    function addIssues(uint256 _projectId, uint256 _issueCount) public {
        require(
            _issueCount <= 10,
            "Cannot add more than 10 issues at a time."
        );
        require(
            msg.sender == projects[_projectId].organizationAddress,
            "Only the project organization can add issues."
        );
        require(
            projects[_projectId].id == _projectId,
            "Project does not exist."
        );

        string[] memory newIssueIds = new string[](_issueCount);

        for (uint256 i = 0; i < _issueCount; i++) {
            string memory issueId = string(
                abi.encodePacked(
                    Strings.toString(_projectId),
                    "-",
                    Strings.toString(projects[_projectId].issueCount + i + 1)
                )
            );

            Issue memory newIssue = Issue({
                id: issueId,
                projectId: _projectId,
                status: IssueStatus.REPORTED
            });

            issues[issueId] = newIssue;
            organizationIssues[msg.sender].push(issueId);
            newIssueIds[i] = issueId;
        }

        projects[_projectId].issueCount += _issueCount;

        emit IssuesAdded(newIssueIds, _projectId);
    }

    // Function to verify reported issues
    function verifyIssues(string[] memory issueIds) public {
        for (uint256 i = 0; i < issueIds.length; i++) {
            string memory issueId = issueIds[i];
            uint256 projectId = issues[issueId].projectId;

            require(issues[issueId].projectId != 0, "Issue does not exist.");
            require(
                msg.sender == projects[projectId].organizationAddress,
                "Only the project organization can verify issues."
            );
            require(
                issues[issueId].status == IssueStatus.REPORTED,
                "Issue cannot be VERIFIED."
            );

            issues[issueId].status = IssueStatus.VERIFIED;
        }

        emit IssueStatusChanged(issueIds, IssueStatus.VERIFIED);
    }

    // Function to mark issues as fixed
    function fixIssues(string[] memory issueIds) public {
        for (uint256 i = 0; i < issueIds.length; i++) {
            uint256 projectId = issues[issueIds[i]].projectId;

            require(
                issues[issueIds[i]].status == IssueStatus.VERIFIED,
                "Issue cannot be FIXED."
            );
            require(
                msg.sender == projects[projectId].organizationAddress,
                "Only the project organization can fix issues."
            );

            issues[issueIds[i]].status = IssueStatus.FIXED;
        }
        emit IssueStatusChanged(issueIds, IssueStatus.FIXED);
    }

    // Function to close fixed issues
    function closeIssues(string[] memory issueIds) public {
        for (uint256 i = 0; i < issueIds.length; i++) {
            uint256 projectId = issues[issueIds[i]].projectId;

            require(
                issues[issueIds[i]].status == IssueStatus.FIXED,
                "Issue cannot be CLOSED."
            );
            require(
                msg.sender == projects[projectId].organizationAddress,
                "Only the project organization can close issues."
            );

            issues[issueIds[i]].status = IssueStatus.CLOSED;
        }
        emit IssueStatusChanged(issueIds, IssueStatus.CLOSED);
    }
}



// 0xccfB293F578DEd4e34514EB26A5f1A87DeC28F14
// 0xccfB293F578DEd4e34514EB26A5f1A87DeC28F14