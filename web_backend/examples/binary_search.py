def binary_search(arr, target):
    """
    二分查找算法实现
    
    Args:
        arr: 已排序的数组
        target: 要查找的目标值
    
    Returns:
        int: 目标值的索引，如果未找到返回-1
    """
    left = 0
    right = len(arr) - 1
    
    while left <= right:
        mid = (left + right) // 2
        
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    
    return -1


def binary_search_recursive(arr, target, left=0, right=None):
    """
    二分查找算法的递归实现
    
    Args:
        arr: 已排序的数组
        target: 要查找的目标值
        left: 搜索范围左边界
        right: 搜索范围右边界
    
    Returns:
        int: 目标值的索引，如果未找到返回-1
    """
    if right is None:
        right = len(arr) - 1
    
    if left > right:
        return -1
    
    mid = (left + right) // 2
    
    if arr[mid] == target:
        return mid
    elif arr[mid] < target:
        return binary_search_recursive(arr, target, mid + 1, right)
    else:
        return binary_search_recursive(arr, target, left, mid - 1)


# 示例用法和测试
def main():
    # 测试数据
    sorted_array = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
    
    print("有序数组:", sorted_array)
    
    # 测试不同的目标值
    test_targets = [7, 1, 19, 4, 20]
    
    for target in test_targets:
        result_iterative = binary_search(sorted_array, target)
        result_recursive = binary_search_recursive(sorted_array, target)
        
        if result_iterative != -1:
            print(f"目标值 {target} 找到于索引 {result_iterative} (迭代实现)")
        else:
            print(f"目标值 {target} 未找到 (迭代实现)")
            
        if result_recursive != -1:
            print(f"目标值 {target} 找到于索引 {result_recursive} (递归实现)")
        else:
            print(f"目标值 {target} 未找到 (递归实现)")
        
        print("---")

if __name__ == "__main__":
    main()