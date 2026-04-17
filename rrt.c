#include <stdlib.h>     //rand, srand
#include <math.h>       //sqrtf
#include <time.h>       //time for seeding rand

#define MAX_NODES    20000      //tree can grow up to this many nodes
#define MAX_CIRCLES  80000      //80k circles can be stored
#define STEP_SIZE    15.0f      //default step size for tree growth
#define GOAL_RADIUS  20.0f      //if tree gets within this distance of goal, we consider it a success
#define CANVAS_W     800        //canvas width
#define CANVAS_H     600        //canvas height
#define CHECK_STEPS  20         //number of points to check along each new segment for collision with circles

typedef struct {
    float x, y;                 //2d position of this node
    int   parent;               //index of parent node in the tree, or -1 for root
} Node;

static Node  nodes[MAX_NODES];          //tree nodes are stored as an array
static int   node_count = 0;            //how many nodes are currently in the tree
static int   path[MAX_NODES];           //stores the final path
static int   path_len   = 0;            //length of the final path in nodes
static float circle_x[MAX_CIRCLES];     //x-coordinates of circles representing obstacles
static float circle_y[MAX_CIRCLES];     //y-coordinates of circles representing obstacles
static float circle_r[MAX_CIRCLES];     //radius of circles representing obstacles
static int   circle_count = 0;          //how many circles are currently stored

//Obstacles
void clear_circles() {      //clear obstacles
    circle_count = 0;
}

void add_circle(float x, float y, float r) {    //add a circular obstacle
    if (circle_count >= MAX_CIRCLES) return;    //dont overflow circle storage
    circle_x[circle_count] = x;
    circle_y[circle_count] = y;
    circle_r[circle_count] = r;
    circle_count++;
}

//Distance function
static float dist(float x1, float y1, float x2, float y2) {     //distance between two points
    float dx = x2-x1, dy = y2-y1;                               
    //dx and dy are the legs of a right triangle, distance is the hypotenuse
    return sqrtf(dx*dx + dy*dy);        //sqrtf is the square root function for floats  
}

//Collision checking
static int segment_hits_circles(float x1, float y1, float x2, float y2) {
    for (int s = 0; s <= CHECK_STEPS; s++) {    //check 21 points
        float t  = (float)s / CHECK_STEPS;      //t goes from 0 to 1 as s goes from 0 to CHECK_STEPS
        float px = x1 + t*(x2-x1);
        float py = y1 + t*(y2-y1);
        for (int i = 0; i < circle_count; i++) {    //check against each circle
            float dx = px - circle_x[i];
            float dy = py - circle_y[i];
            if (dx*dx + dy*dy <= circle_r[i]*circle_r[i]) {
                return 1; //point in circle - collision!
            }
        }
    }
    return 0;
}

static int nearest(float x, float y) {  //finding the nearest node in the tree to a given point
    int   best_i = 0;                   //start by assuming the first node is the closest
    float best_d = 1e30f;               //best distance starts as a very large number
    for (int i = 0; i < node_count; i++) {          //check each node in the tree
        float d = dist(nodes[i].x, nodes[i].y, x, y);   //distance from this node to the point
        if (d < best_d) { best_d = d; best_i = i; } //update best if this node is closer
    }
    return best_i;  //return index of closest node
}

int get_node_count(){ 
    return node_count; 
}

int get_path_length(){ 
    return path_len;
}

float get_node_x(int i){
    return nodes[i].x;
}

float get_node_y(int i){
    return nodes[i].y;
}

int   get_node_parent(int i){ 
    return nodes[i].parent;
}

int rrt_run(float sx, float sy, float gx, float gy, float step_size, float goal_bias) { //the rrt
    srand((unsigned)time(NULL));        //seed random number generator with current time
    node_count = 0;                     //reset tree
    path_len   = 0;                     //reset path

    nodes[0].x = sx; nodes[0].y = sy; nodes[0].parent = -1; //add start node to tree
    node_count = 1;
//RRT main loop
    for (int iter = 0; iter < MAX_NODES - 1; iter++) {      //main RRT loop, runs until we hit the max number of nodes
        float rx, ry;                                       //random point to grow towards
        if ((float)rand() / RAND_MAX < goal_bias) {         //with probability = goal_bias, set random point to the goal (bias towards goal)
            rx = gx; ry = gy;                               //bias towards goal by making the random point the goal some of the time
        } else {
            rx = (float)(rand() % CANVAS_W);                //random x in canvas
            ry = (float)(rand() % CANVAS_H);                //random y in canvas
        }
//Find nearest node in tree to random point
        int ni = nearest(rx, ry);                           //index of nearest node in tree to random point
        float d = dist(nodes[ni].x, nodes[ni].y, rx, ry);   //distance from nearest node to random point
        if (d < 1.0f) continue;                             //if random point is very close to nearest node, skip this iteration
//Step towards random point from nearest node, but only up to step_size distance
        float nx = nodes[ni].x + step_size * (rx - nodes[ni].x) / d;    //new node x, step_size distance from nearest node towards random point
        float ny = nodes[ni].y + step_size * (ry - nodes[ni].y) / d;    //new node y, step_size distance from nearest node towards random point
//Check for collision
        if (segment_hits_circles(nodes[ni].x, nodes[ni].y, nx, ny)) continue; 
        //if new segment hits a circle, skip this iteration
//Add new node to tree
        nodes[node_count].x      = nx;
        nodes[node_count].y      = ny;
        nodes[node_count].parent = ni;
        node_count++;
//Check if new node is within GOAL_RADIUS of the goal
        if (dist(nx, ny, gx, gy) < GOAL_RADIUS) {
            nodes[node_count].x      = gx;  //add goal node to tree
            nodes[node_count].y      = gy;
            nodes[node_count].parent = node_count - 1;
            node_count++;

            int cur = node_count - 1;               //index of goal node
            while (cur != -1) {                     
            //trace back from goal to start using parent links, and store the path
                path[path_len++] = cur;             //add this node to the path
                cur = nodes[cur].parent;            //move to parent node
            }
            for (int a = 0, b = path_len-1; a < b; a++, b--) {          
            //reverse the path so it goes from start to goal instead of goal to start
                int tmp = path[a]; path[a] = path[b]; path[b] = tmp;
            }
            return 1;
        }
    }
    return 0;       //if we exit the loop without finding a path, return failure
}